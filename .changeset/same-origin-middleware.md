---
'@ecopages/core': minor
---

Add `sameOrigin()`, a middleware that refuses a state-changing request another site started. For a method other than `GET`, `HEAD`, `OPTIONS` or `QUERY` it answers HTTP 403, before the body is read, unless `Sec-Fetch-Site` is `same-origin` or `none`, or, without that header, `Origin` equals the origin of `request.url`. A request with neither header is refused too; a route that serves clients that are not browsers and authenticates them itself passes `sameOrigin({ allowNonBrowser: true })`, and `onReject` builds a custom 403. It relies on the new `allowedHosts` check for a trustworthy `request.url`.
