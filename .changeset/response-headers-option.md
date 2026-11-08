---
'@ecopages/core': minor
---

`eco.config.ts` accepts a `headers` option: a list of `{ source, headers }` rules that add response headers to every response Ecopages serves under `dev`, `start` and `preview`, including rendered pages and files from `public/` and `dist/client`. This makes cross-origin isolation (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, needed for `SharedArrayBuffer` and threaded WebAssembly) and scoped CORS configurable. A configured header replaces a same-named framework header, and an invalid `source` fails when the config loads.
