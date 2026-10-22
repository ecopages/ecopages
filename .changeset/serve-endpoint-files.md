---
'@ecopages/core': minor
---

Serve `*.api.ts` endpoint files under the pages directory. The file exports one handler per method (`export const GET = defineGet({ handler })`, without `path`) and answers its URL through the same pipeline as `app.add()` routes: params (a catch-all as an array), schema validation, middleware and `app.onError`. A method the file does not export answers `405` with an `Allow` header. A file whose exports cannot be served fails when requested, with an error that names the file. An `app.ts` route on the same route keeps the methods it registers, and startup logs a warning naming both. An endpoint file whose URL ends in a known static file extension, such as `feed.xml.api.ts`, fails discovery, since the server never routes such a URL to a file; register it in `app.ts`. In `ecopages dev`, saving an endpoint file serves its new handlers without a restart.
