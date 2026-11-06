---
'@ecopages/core': minor
---

Build the file behind `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`, and the same with `SharedWorker`, in browser code as its own script. `ecopages build` writes each worker as a hashed file under `dist/client/assets`, records it for `ecopages start`, and points the URL at it; `ecopages dev` serves it through the dev transform server. A relative worker URL without `{ type: 'module' }` fails the build and the dev module request, since workers are built as ES modules. A URL that is not a relative string literal is left as written, with a warning in development.
