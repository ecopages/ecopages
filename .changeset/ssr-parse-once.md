---
'@ecopages/core': patch
---

Serve pages with less work per request. Route, API and WebSocket patterns are parsed and ordered once when they are registered instead of on every request, and a rendered page is rewritten as a string instead of being wrapped in a `Response` and read back several times.
