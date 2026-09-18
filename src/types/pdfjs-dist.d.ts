/**
 * `pdfjs-dist` ships types for its package root but not for the `.mjs` build
 * entry, which is the one that works under Node without a bundler — and which
 * `src/lib/jkai/extract/pdf.ts` imports. Declaring the module keeps that file a
 * verbatim copy instead of rewriting its import to satisfy the type checker.
 */
declare module 'pdfjs-dist/build/pdf.mjs';
