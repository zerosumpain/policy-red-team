/**
 * THE ADMIN API — the only part of this service behind a password.
 *
 * Everything here changes what the install does or holds a credential, so the
 * whole branch is gated before any handler runs. The gate is a signed cookie
 * (`$lib/server/admin-auth`), NOT an address check: behind a tunnel every
 * request arrives from 127.0.0.1, so "local connections only" is a gate that
 * passes for the entire internet — the mistake that took the author's main site
 * down for 33 hours.
 *
 * A SECRET GOES IN AND DOES NOT COME OUT. `GET /api/admin/config` reports
 * whether each secret is set, never its value, so a screenshot, a proxy log or a
 * browser cache between here and the reader carries nothing worth having. The
 * same posture the share token had, for the same reason.
 *
 * SIGNING IN IS RATE LIMITED. A password reachable from the open internet with
 * unlimited attempts is a password with a deadline, and the limiter this repo
 * already has is a token bucket per source — which behind a tunnel is one
 * bucket for everyone, and that is the conservative direction.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ADMIN_COOKIE, adminProblem, clearedCookie, issueSession, passwordMatches,
  readCookie, sessionCookie, sessionValid,
} from '$lib/server/admin-auth';
import { rateLimit } from '$lib/server/rate-limit';
import { providers, redact, type ProviderConfig } from '$lib/llm/providers';
import { clearLLMClientCache, resolveProvider } from '$lib/llm/client';
import { registerProviderModels } from '$lib/server/models/catalogue';
import {
  ACTIVE_PROVIDER, deleteSetting, providerSettingKey, readAll, writeSetting,
} from '$lib/server/settings-store';
import { HttpError, readJson, sendJson } from './http';

/** True when the reader reached us over HTTPS — behind a tunnel, only the header knows. */
function isSecure(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (proto ?? '').split(',')[0].trim() === 'https';
}

export function isSignedIn(req: IncomingMessage): boolean {
  return sessionValid(readCookie(req.headers.cookie, ADMIN_COOKIE));
}

/**
 * Whether the panel exists at all on this install, and what to say if not.
 *
 * Reported without a session on purpose: the sign-in page needs to be able to
 * say "no password is set here" rather than presenting a form that cannot
 * succeed. It reveals nothing — an install with no admin password has no
 * credentials to protect through this route.
 */
export function adminStatus(req: IncomingMessage) {
  return { available: adminProblem() === null, problem: adminProblem(), signedIn: isSignedIn(req) };
}

export async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
  method: string,
): Promise<boolean> {
  // ── Unauthenticated: only what the sign-in page itself needs ──────────────
  if (segments.length === 1 && segments[0] === 'status' && method === 'GET') {
    sendJson(res, 200, adminStatus(req));
    return true;
  }

  if (segments.length === 1 && segments[0] === 'session' && method === 'POST') {
    const problem = adminProblem();
    if (problem) throw new HttpError(403, problem);
    // One bucket for everyone behind a tunnel, which is the conservative
    // direction: a shared limit slows an attacker and inconveniences one owner.
    const limit = rateLimit('admin-signin', { capacity: 8, refillPerSecond: 1 / 30 });
    if (!limit.allowed) {
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 1000)} seconds.`);
    }
    const body = await readJson(req);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!passwordMatches(password)) {
      // The same answer whether the password was wrong, empty or absurd.
      throw new HttpError(401, 'That is not the password.');
    }
    const session = issueSession();
    if (!session) throw new HttpError(403, 'The panel is closed on this install.');
    res.setHeader('set-cookie', sessionCookie(session, isSecure(req)));
    sendJson(res, 200, { signedIn: true });
    return true;
  }

  if (segments.length === 1 && segments[0] === 'session' && method === 'DELETE') {
    res.setHeader('set-cookie', clearedCookie(isSecure(req)));
    sendJson(res, 200, { signedIn: false });
    return true;
  }

  // ── Everything below needs the cookie ─────────────────────────────────────
  if (!isSignedIn(req)) throw new HttpError(401, 'Sign in to the admin panel first.');

  if (segments.length === 1 && segments[0] === 'config' && method === 'GET') {
    sendJson(res, 200, await configPayload());
    return true;
  }

  if (segments.length === 2 && segments[0] === 'config' && method === 'POST') {
    const definition = providers().find((p) => p.id === segments[1]);
    if (!definition) throw new HttpError(404, 'This build does not offer that provider.');
    const body = await readJson(req);
    const values = (body.values ?? {}) as Record<string, unknown>;

    for (const field of definition.fields) {
      const raw = values[field.name];
      if (raw === undefined) continue; // not sent: leave what is stored alone
      if (typeof raw !== 'string') throw new HttpError(400, `${field.label} has to be text.`);
      const value = raw.trim();
      // AN EMPTY SECRET CLEARS IT rather than storing a blank, so "remove this
      // key" is expressible. A non-secret empty value is a real value.
      if (!value && field.secret) await deleteSetting(providerSettingKey(definition.id, field.name));
      else await writeSetting(providerSettingKey(definition.id, field.name), value);
    }

    clearLLMClientCache();
    sendJson(res, 200, await configPayload());
    return true;
  }

  if (segments.length === 1 && segments[0] === 'active' && method === 'POST') {
    const body = await readJson(req);
    const id = typeof body.provider === 'string' ? body.provider : '';
    if (!providers().some((p) => p.id === id)) throw new HttpError(400, 'This build does not offer that provider.');
    await writeSetting(ACTIVE_PROVIDER, id);
    clearLLMClientCache();
    sendJson(res, 200, await configPayload());
    return true;
  }

  /*
   * A REAL CALL, AND A CHEAP ONE. There is no way to know a credential works
   * without using it, and "saved" is not the same claim as "reachable" — a
   * bridge on another machine, an expired key and a deployment that was renamed
   * all look identical until something asks. One token of output is the
   * smallest honest question.
   */
  if (segments.length === 1 && segments[0] === 'test' && method === 'POST') {
    const { definition, config, problem } = await resolveProvider();
    if (problem) throw new HttpError(400, problem);
    const started = Date.now();
    try {
      const client = definition.client(config);
      const model = definition.model(config) || definition.models(config)[0]?.id;
      if (!model) throw new Error('Nothing is configured to call.');
      const reply = await client.chat.completions.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      });
      sendJson(res, 200, {
        ok: true,
        provider: definition.label,
        model: reply.model ?? model,
        ms: Date.now() - started,
      });
    } catch (err) {
      // 200 with `ok: false`: a failed connection test is a successful test.
      // The message is whatever the service said, which is the useful half.
      sendJson(res, 200, {
        ok: false,
        provider: definition.label,
        ms: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  return false;
}

async function configPayload() {
  const stored = await readAll().catch(() => ({} as Record<string, string>));
  const active = await resolveProvider();
  // Refreshed here so the model picker offers what the active provider serves —
  // otherwise `ingest.ts` reads a deployment name as unknown and the assessment
  // records "the configured default" for a run that named one.
  registerProviderModels(active.definition.models(active.config).map((m) => m.id));

  return {
    active: active.definition.id,
    activeProblem: active.problem,
    fromEnvironment: active.fromEnvironment,
    pinned: Boolean(process.env.POLICY_PROVIDER?.trim()),
    providers: providers().map((definition) => {
      const config: Record<string, string> = {};
      for (const field of definition.fields) {
        config[field.name] = stored[providerSettingKey(definition.id, field.name)] ?? '';
      }
      return {
        id: definition.id,
        label: definition.label,
        blurb: definition.blurb,
        fields: definition.fields,
        values: redact(definition, config),
        models: definition.models(config),
      };
    }),
  };
}
