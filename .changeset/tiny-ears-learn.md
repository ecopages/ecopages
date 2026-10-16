---
'@ecopages/core': minor
---

Breaking: Route params are decoded once per URL segment in every route kind, so handlers receive values such as `café` instead of `caf%C3%A9`. Encoded slashes remain within their original segment, and malformed escapes return HTTP 400. Remove manual decoding of route params.
