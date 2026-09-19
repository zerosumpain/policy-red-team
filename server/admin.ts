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
import { builtInModels, offeredModels, registerProviderModels, tierForCost, type OfferedModel } from '$lib/server/models/catalogue';
import { loadOfferedModels, saveOfferedModels, refreshModelMenu, RUN_TOKEN_CEILING } from '$lib/server/models/offered-store';
import { tokenCeiling } from '$lib/server/budget';
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
   * THE MOST ONE RUN MAY SPEND.
   *
   * A subscription costs no money per call, so every run this service made on
   * 2026-09-19 reported "$0.00" while consuming 77% of a weekly allowance. The
   * ceiling exists because a meter nobody reads stops nothing. Zero clears it.
   */
  if (segments.length === 1 && segments[0] === 'ceiling' && method === 'POST') {
    const body = await readJson(req);
    const tokens = Number(body.tokens);
    if (!Number.isFinite(tokens) || tokens < 0) throw new HttpError(400, 'Give a number of tokens, or 0 for no ceiling.');
    if (tokens > 0) await writeSetting(RUN_TOKEN_CEILING, String(Math.floor(tokens)));
    else await deleteSetting(RUN_TOKEN_CEILING);
    await refreshModelMenu();
    sendJson(res, 200, await configPayload());
    return true;
  }

  /*
   * EVERYTHING THE ACTIVE PROVIDER SELLS, so the panel can build a menu from it.
   *
   * Deliberately NOT cached. It is a few hundred rows behind a sign-in, asked
   * only when somebody opens the picker, and a stale catalogue is worse than a
   * slow one: the whole point is to find the model that appeared last week.
   */
  if (segments.length === 1 && segments[0] === 'catalogue' && method === 'GET') {
    const { definition, config, problem } = await resolveProvider();
    if (problem) throw new HttpError(400, problem);
    if (!definition.catalogue) {
      throw new HttpError(400, `${definition.label} does not publish a list of models. Type the name in instead.`);
    }
    let entries;
    try {
      entries = await definition.catalogue(config);
    } catch (err) {
      // The same posture as the connection test: a provider that would not
      // answer is a fact about the provider, and the message it gave is the
      // useful half.
      throw new HttpError(502, `${definition.label} would not list its models: ${err instanceof Error ? err.message : String(err)}`);
    }
    sendJson(res, 200, { provider: definition.label, entries });
    return true;
  }

  /*
   * WHICH OF THEM THE ASSESSMENT PICKER OFFERS.
   *
   * An empty list is not an error, it is the reset: it clears the setting and
   * the built-in five come back. Note is stored with the choice so the submit
   * form never has to ask a provider what something is called.
   */
  if (segments.length === 1 && segments[0] === 'models' && method === 'POST') {
    const body = await readJson(req);
    const raw = body.models;
    if (!Array.isArray(raw)) throw new HttpError(400, 'Send a list of models.');
    if (raw.length > 60) throw new HttpError(400, 'That is more models than a dropdown can usefully hold. Pick the ones you will actually run.');

    const seen = new Set<string>();
    const models: OfferedModel[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') throw new HttpError(400, 'Each model has to be an object.');
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) throw new HttpError(400, 'A model needs an id.');
      if (seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
        note: typeof row.note === 'string' ? row.note.slice(0, 400) : '',
        tier: typeof row.cost === 'number' || row.cost === null ? tierForCost(row.cost as number | null) : 'balanced',
      });
    }

    await saveOfferedModels(models);
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

  const chosen = await loadOfferedModels().catch(() => null);

  return {
    active: active.definition.id,
    activeProblem: active.problem,
    fromEnvironment: active.fromEnvironment,
    pinned: Boolean(process.env.POLICY_PROVIDER?.trim()),
    // The assessment picker's menu, and whether anybody has touched it. The
    // panel needs to tell "these are the five this build ships with" from "these
    // are the five I chose", because the reset control only makes sense for one.
    menu: offeredModels(),
    menuChosen: Boolean(chosen),
    menuPinned: Boolean(process.env.POLICY_MODELS?.trim()),
    // 0 means no ceiling, which is the default.
    tokenCeiling: tokenCeiling(),
    builtIn: builtInModels(),
    canBrowse: Boolean(active.definition.catalogue),
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
