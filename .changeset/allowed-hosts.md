---
'@ecopages/core': minor
---

Refuse requests for hosts the app does not serve. The new `allowedHosts` option in `defineConfig` lists the hostnames (and `*.example.com` wildcards) the Ecopages server answers; a request for any other host, or a WebSocket upgrade for one, gets HTTP 400 before routing. The host checked is the one `request.url` carries: `Host`, or `X-Forwarded-Host` under `trustProxy`. This closes the DNS rebinding gap that a `Host`-based request URL leaves open: once a host is allowed, `request.url` is trustworthy to compare with `Origin`.

Breaking behaviour change, acceptable before 1.0: production now answers only the host of `baseUrl` (or `ECOPAGES_BASE_URL`) unless `allowedHosts` is set, so set `ECOPAGES_BASE_URL` on the running server and list any other host, such as `localhost` for a health check, in `allowedHosts` (a list replaces the `baseUrl` host, so name the public host in it too). `ecopages dev` allows `localhost`, its subdomains and IP addresses by default. A request without a usable `Host` is refused instead of falling back to the listen address, `allowedHosts: true` turns the host check off and is unsafe, and a malformed entry fails the config load.

The request URL also no longer takes a host from the request target: a target such as `//evil.example/x` or `http://evil.example/x` keeps the checked host and only contributes its path and query.
