---
'@ecopages/core': minor
---

Add `onInvalid(issues, context)` to routes. A request that fails a route's `schema` still answers HTTP 400 with the issues as JSON, but a route that serves an HTML form can now answer it in its own way, for example by redirecting back with a message. It is available on the define helpers, endpoint file exports, `app.get()` and the other route options, and in groups.
