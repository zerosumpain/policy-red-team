/**
 * `npm run research:bodies` — check the public record for every body the
 * persona library holds.
 *
 * Free: GOV.UK search, Parliament's committees API and Hansard, with no key
 * and no model call. Each source is asked only when its last answer about a
 * body is older than thirty days; `--force` asks them all again.
 *
 * The transport import comes FIRST, for the reason `register-refresh.ts`
 * gives: it installs the proxy-aware dispatcher every `fetch` in this process
 * then uses, so an install whose only way out is a proxy checks through it.
 *
 * IT OPENS THE DATABASE, unlike the register refresher, because the store is a
 * table and the list of bodies is the library. PGlite is one process: stop the
 * server first, exactly as for `npm run assess`. A running server checks the
 * same records itself, at run time, for the bodies each assessment meets.
 */
import '$lib/load-env';
import '$lib/llm/providers/transport';
import '../src/lib/polyfills';
import { client } from '$lib/db';
import { migrate } from '../scripts/migrate.mjs';
import { refreshLibrary } from '$lib/policy-analysis/server/body-evidence';
import { chosenEngine, refreshSearchConfig } from '$lib/server/search';

const force = process.argv.includes('--force');

try {
  await migrate(client, { log: () => {} });
  // The panel's setting, not just the environment's: a reader who set search
  // to `none` in /admin meant this command too.
  await refreshSearchConfig();
  if (chosenEngine() === 'none') {
    console.log('This install is set not to look anything up, so the public record is not checked.');
    await client.close();
    process.exit(0);
  }
  console.log(`Checking the public record for every body in the library${force ? ', asking every source again' : ''}…`);
  const result = await refreshLibrary({ force, log: (line) => console.log(line) });
  if (!result.bodies) {
    console.log('The library holds no body matched to the GOV.UK list yet, so there is nothing to check.');
  } else {
    console.log(`${result.bodies} ${result.bodies === 1 ? 'body' : 'bodies'}: ${result.asked} checked, ${result.added} new ${result.added === 1 ? 'record' : 'records'}${result.failed ? `, ${result.failed} with a source that did not answer` : ''}.`);
  }
  await client.close();
} catch (err) {
  console.error((err as Error).message);
  await client.close().catch(() => {});
  process.exit(1);
}
