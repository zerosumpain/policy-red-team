/**
 * READ `.env` BEFORE ANYTHING READS `process.env`.
 *
 * This module exists for its side effect and for its POSITION. It must be the
 * first import of every entry point, because ES modules are evaluated in import
 * order and several modules below read the environment while they are being
 * evaluated rather than when they are called — `src/lib/db/index.ts:25` computes
 * `DATA_DIR` from `POLICY_DATA_DIR` at module scope, and that value is frozen
 * for the life of the process.
 *
 * THIS IS WHY A `try { process.loadEnvFile() }` WRITTEN AMONG THE IMPORTS DOES
 * NOT WORK, and it is the shape the mistake takes: imports are hoisted, so the
 * statement runs after every module it was meant to precede. `cli.ts` has
 * carried that spelling since phase 0, which means `POLICY_DATA_DIR` in a
 * `.env` has never once been honoured — the database quietly opened in
 * `.data/db` while the file said somewhere else. The server had no load at all,
 * so `cp .env.example .env && npm start` — the README's first instruction —
 * configured nothing whatsoever.
 *
 * SILENT WHEN THERE IS NO FILE. A deployment managed by Ansible or systemd
 * supplies its environment through `EnvironmentFile=` and has no `.env` to
 * find; that is not an error and must not be reported as one. And the
 * environment that is already set WINS: `loadEnvFile` does not overwrite an
 * existing variable, which is the same precedence the settings store follows —
 * the environment beats the file beats the store, one rule everywhere.
 */

/** Whether a `.env` was found and read, for the boot report to say so. */
export const envFileLoaded = (() => {
  try {
    process.loadEnvFile();
    return true;
  } catch {
    // No .env, or unreadable. Both are ordinary.
    return false;
  }
})();
