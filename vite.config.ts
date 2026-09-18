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
    sourcemap: true,
  },
  // `host: true` binds all interfaces so the dev server is reachable as
  // homeserv:5290 from another machine, not just from this one.
  server: { port: 5290, host: true },
});
