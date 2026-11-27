---
'@ecopages/core': minor
---

Build the request URL on the Ecopages server (Node or Bun) from the `Host` the visitor sent, so `new URL(request.url).origin` in an Endpoint or Explicit Route is the address they used instead of the address the server listens on. The listen origin remains the fallback when `Host` is missing or is not a plain host. `X-Forwarded-Host` and `X-Forwarded-Proto` are read only with the new `trustProxy: true` option in `defineConfig`, which is safe only behind a proxy you control that overwrites both headers.
