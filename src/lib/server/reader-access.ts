import { readSetting, writeSetting } from './settings-store';
import { boundToLoopback } from './claim';

/**
 * WHO MAY READ THE ASSESSMENTS, as opposed to who may change the configuration.
 *
 * Until phase 18 the answer was "anyone who can reach the port", and that was a
 * deliberate, documented decision: the service binds to loopback and belongs to
 * whoever is at the machine. Then it was put behind a cloudflared tunnel, where
 * every request arrives from 127.0.0.1 and the hostname is public — so the
 * documented decision quietly became "anyone who knows the name can read every
 * assessment, download the whole paper, and start billable runs". The Cloudflare
 * Access policy that was supposed to be the real lock was still outstanding four
 * days later (`docs/phase-13.md`), which is the ordinary fate of a control that
 * lives outside the repository.
 *
 * THREE STATES, AND THE DEFAULT IS THE ONE THAT DOES NOT BREAK ANYTHING:
 *
 *   open      no gate. What every existing install has today.
 *   password  a reader password, separate from the admin one.
 *
 * `POLICY_ACCESS` in the environment beats the stored setting, as everywhere
 * else here.
 *
 * WHY THE DEFAULT IS NOT DERIVED FROM THE BIND ADDRESS. It is tempting to say
 * "loopback means open, anything else means password", and it is wrong for the
 * one deployment that matters: `policy.strangeramblings.com` is bound to
 * loopback and reached through a tunnel, so a derived default would leave
 * exactly the install that needs the gate exactly as exposed as it is now. The
 * bind address cannot see a tunnel. So the default is `open` — no existing
 * install changes behaviour without somebody deciding — and the decision for
 * that host is a deliberate `policy_access: password` in its Ansible, recorded
 * in `docs/phase-18-plan.md`.
 *
 * WHAT IT DOES NOT GATE. `/health`, because the deploy script's own smoke test
 * is `curl -fsS /health` and a gate that fails the deploy that installs it is a
 * gate nobody keeps. It answers `{ok:true}` and nothing else.
 */

export type AccessMode = 'open' | 'password';

export const ACCESS_MODE = 'access.mode';
export const READER_COOKIE = 'policy_reader';

const MODES = new Set<AccessMode>(['open', 'password']);

let cached: AccessMode | undefined;

export function clearAccessModeCache(): void {
  cached = undefined;
}

/** True when the environment pins it, so the panel cannot change it. */
export function accessModeIsPinned(): boolean {
  return MODES.has(process.env.POLICY_ACCESS?.trim() as AccessMode);
}

export async function accessMode(): Promise<AccessMode> {
  const fromEnv = process.env.POLICY_ACCESS?.trim() as AccessMode | undefined;
  if (fromEnv && MODES.has(fromEnv)) return fromEnv;
  if (cached !== undefined) return cached;
  const stored = (await readSetting(ACCESS_MODE).catch(() => null)) as AccessMode | null;
  cached = stored && MODES.has(stored) ? stored : 'open';
  return cached;
}

export async function setAccessMode(mode: AccessMode): Promise<void> {
  await writeSetting(ACCESS_MODE, mode);
  cached = mode;
}

/**
 * A sentence for the boot report and the panel: what this install is, in
 * the terms the reader cares about.
 */
export async function accessSummary(): Promise<string> {
  const mode = await accessMode();
  if (mode === 'password') return 'Readers need a password.';
  return boundToLoopback()
    ? 'Open to anyone who can reach the port, which is this machine.'
    : 'OPEN TO ANYONE WHO CAN REACH IT, and it is not bound to loopback.';
}
