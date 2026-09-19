import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  // Vite 8 minifies CSS with LightningCSS, which rejects the `@media (min-width: 0\0)`
  // Internet Explorer hack govuk-frontend still ships and kills the build outright.
  // `errorRecovery` strips those rules instead — they are dead code for every
  // browser this service supports. Found in phase 0; see docs/phase-0.md.
  css: { lightningcss: { errorRecovery: true } },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    cssMinify: 'lightningcss',
    /*
     * HIDDEN, NOT OFF. The map is still written for local debugging; what goes
     * is the `sourceMappingURL` comment that advertises it, so a browser no
     * longer fetches 2.6 MB on every visit with devtools open.
     *
     * It was also the only public copy of this service's source. The GitHub repo
     * is private, and `sourcesContent` carried 1,959,580 bytes of original
     * TypeScript — the whole of `client/` plus `src/lib/policy-analysis` — served
     * 200 from an unauthenticated hostname, including the commented reasoning
     * about the admin gate and why an address check would pass for the whole
     * internet. `server/static.ts` now refuses the extension as well, because a
     * hashed filename is not a secret.
     */
    sourcemap: 'hidden',
  },
  // `host: true` binds all interfaces so the dev server is reachable as
  // homeserv:5290 from another machine, not just from this one.
  server: { port: 5290, host: true },
});
