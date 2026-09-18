import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * THE OFFLINE PACK'S SHELL — a second, deliberately small build.
 *
 * `npm run build:offline` compiles the report into ONE IIFE and ONE stylesheet
 * under `static/policy-offline/`. The export endpoint reads those two files off
 * disk and interpolates them into an HTML skeleton, so producing a pack at
 * request time is string concatenation: no headless browser, no bundler in the
 * request path, and the same bytes every time.
 *
 * WHY NOT REUSE THE MAIN BUILD: its output is a graph of hashed chunks that
 * resolve against a server's URL space. A `file://` page can load none of it.
 *
 * IIFE, NOT ESM. A `<script type="module">` is subject to CORS even from a
 * file:// page, so a double-clicked pack would execute nothing. This is the
 * single most important line in this file.
 */
/**
 * Nothing in the pack may point outside the pack.
 *
 * The compiled stylesheet carries three `url(/assets/govuk/images/govuk-crest.svg)`
 * references, on the GOV.UK header and footer crest rules. On the web they are
 * inert — this service never renders those classes, and the image is never
 * shipped. In a `file://` pack they are worse than inert: a root-relative URL
 * resolves against the filesystem root, so a reader with no network gets three
 * failed requests for a file that was never theirs to have.
 *
 * Rewritten to an empty data URI rather than deleted, because the declarations
 * are inside shorthand properties where removing the value would break the rule.
 * The pack test refuses any `url(/…)`, which is how this was found.
 */
function noExternalUrls() {
  return {
    name: 'no-external-urls',
    enforce: 'post' as const,
    generateBundle(_options: unknown, bundle: Record<string, { type: string; source?: string | Uint8Array }>) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || typeof asset.source !== 'string') continue;
        asset.source = asset.source.replace(/url\(\s*(['"]?)\/[^)'"]*\1\s*\)/g, 'url("data:image/svg+xml,")');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), noExternalUrls()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  css: { lightningcss: { errorRecovery: true } },
  // Vite's `lib` mode does not substitute NODE_ENV the way an app build does, so
  // this was bundling REACT'S DEVELOPMENT BUILD into the pack: half a megabyte of
  // warning strings, several of which contain the literal text
  // `<link rel="stylesheet"`. The pack test — which refuses anything that looks
  // like it reaches the network — failed on those strings, correctly, and the
  // real fault was shipping a dev build to a reader at all.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  // Nothing here references a file in `static/`, and pointing at it would make
  // the build copy the whole directory — including its own output — into itself.
  publicDir: false,
  build: {
    outDir: 'static/policy-offline',
    emptyOutDir: true,
    cssCodeSplit: false,
    cssMinify: 'lightningcss',
    target: 'es2022',
    lib: {
      entry: fileURLToPath(new URL('./client/offline/entry.tsx', import.meta.url)),
      formats: ['iife'],
      name: 'PolicyOfflinePack',
      // The export endpoint reads these two by name, so both are pinned.
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
  },
});
