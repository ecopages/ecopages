---
'@ecopages/core': minor
---

Serve `*.api.ts` endpoint files under the pages directory. The file exports one handler per method (`export const GET = defineGet({ handler })`, without `path`) and answers its URL through the same pipeline as `app.add()` routes: params (a catch-all as an array), schema validation, middleware and `app.onError`. A method the file does not export answers `405` with an `Allow` header of the methods it does; `HEAD` and `OPTIONS` are not added. A file with no method export, or a method export that is not a handler, is built for another method, or sets `path`, fails to load when requested: the request answers `500`, or goes to `app.onError`, and the error names the file. An `app.ts` route on the same pathname keeps the methods it registers and startup logs a warning naming both, and `app.static()` on that pathname still answers first. In `ecopages dev`, saving an endpoint file serves its new handlers without a restart.
