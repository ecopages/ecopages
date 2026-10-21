---
'@ecopages/core': minor
---

Support the HTTP QUERY method (RFC 10008), a safe, idempotent read whose request body carries the query. Add `defineQuery`, `app.query(path, handler, options)`, `api.query` in `defineGroupHandler` and `query` on the route group builder, and let an endpoint file `export const QUERY = defineQuery({ ... })`. A `schema.body` is validated as for `POST` (`400` on invalid input, `415` for a body with a missing or unsupported `Content-Type`), and without it the handler reads `request` itself. A file that does not export `QUERY` answers a QUERY request with `405` and an `Allow` header that omits it. Ecopages does not cache QUERY responses and does not set `Accept-Query` or `Vary`; handlers set them.
