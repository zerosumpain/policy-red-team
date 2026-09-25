/**
 * `npm run register:refresh` — rewrite the committed GOV.UK register snapshot.
 *
 * The transport import comes FIRST and is the point of it: it installs the
 * proxy-aware dispatcher every `fetch` in this process then uses, so a refresh
 * inside an estate whose only way out is a proxy goes through the proxy. See
 * `src/lib/llm/providers/transport.ts` for the measurement that made this rule.
 *
 * Writes the file and nothing else. A running server loads the new snapshot
 * into its table the next time it starts (see `ensureRegister`), so a refresh
 * never needs the database — which matters, because PGlite is one process and
 * the server may be holding it.
 */
import '$lib/llm/providers/transport';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRegister } from '$lib/policy-analysis/server/register-fetch';
import { serialiseSnapshot } from '$lib/policy-analysis/register';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'register', 'govuk-organisations.json');

async function previousCount(): Promise<number | null> {
  try {
    return (JSON.parse(await readFile(TARGET, 'utf8')) as { count?: number }).count ?? null;
  } catch {
    return null;
  }
}

try {
  console.log('Reading the GOV.UK organisations register…');
  const snapshot = await fetchRegister({ log: (line) => console.log(line), previousCount: await previousCount() });
  await mkdir(path.dirname(TARGET), { recursive: true });
  await writeFile(TARGET, serialiseSnapshot(snapshot));
  console.log(`Wrote ${snapshot.count} organisations to ${path.relative(ROOT, TARGET)}.`);
  console.log('Commit the file. A server loads it into its table the next time it starts.');
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
