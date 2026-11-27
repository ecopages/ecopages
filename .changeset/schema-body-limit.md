---
'@ecopages/core': minor
---

Limit the request body a route's `schema.body` reads, and read it after the route's middleware. A body over the new `maxRequestBodySize` option (10 MiB by default; `Infinity` for no limit) answers HTTP 413, refused from `Content-Length` or while it streams, so it is never buffered whole. The body is now parsed and validated after the route's `middleware` runs, so a middleware that refuses the request answers before any of the body is read; a middleware sees `body` unset, and `params`, `query` and `headers` are still validated before it.
