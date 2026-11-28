---
'@ecopages/core': minor
---

Refuse requests for hosts the app does not serve. The new `allowedHosts` option in `defineConfig` lists hostnames (and `*.example.com` wildcards) that the Ecopages server answers in addition to the host of `baseUrl`; a request for any other host, or a WebSocket upgrade for one, gets HTTP 400 before routing. The host checked is the one `request.url` carries: `Host`, or `X-Forwarded-Host` under `trustProxy`. This closes the DNS rebinding gap that a `Host`-based request URL leaves open: once a host is allowed, `request.url` is trustworthy to compare with `Origin`.

Breaking behaviour change, acceptable before 1.0: production now answers only the host of `baseUrl` (or `ECOPAGES_BASE_URL`) and the hosts in `allowedHosts`, so set `ECOPAGES_BASE_URL` on the running server and list any other host, such as `localhost` for a health check, in `allowedHosts`. `ecopages dev` and `ecopages preview` also allow `localhost`, its subdomains and IP addresses. A request without a usable `Host` is refused instead of falling back to the listen address, `allowedHosts: true` turns the host check off and is unsafe, and a malformed entry fails the config load. `NodeRuntimeServeOptions` and the WebSocket upgrade options now require a `hostPolicy`, so no server entry point runs without one.

Also breaking: a WebSocket upgrade whose `Origin` is not the origin of the request, such as a handshake from a page of another site, is refused with HTTP 403 before the upgrade, the dev HMR socket included. An upgrade without `Origin` (a client that is not a browser) passes. Behind a proxy that terminates TLS, set `trustProxy: { proto: true }` so the request origin is `https`, like the page's.

The request URL also no longer takes a host from the request target: a target such as `//evil.example/x` or `http://evil.example/x` keeps the checked host and only contributes its path and query.
