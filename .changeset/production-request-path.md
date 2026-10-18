---
'@ecopages/core': patch
---

A production server no longer repeats development work on each request. It reuses a module it has imported, a processed asset, and a component's virtual imports without hashing or reading their sources again, gzips each emitted CSS and JS file once instead of on every render, skips collecting the source paths that only development invalidation reads, and shares one asset processor run between concurrent renders. Kitchen-sink `/latest`, which renders a view through `ctx.renderServerModule`, serves about 870 requests per second under 64 concurrent clients, up from 29 on the same machine before.
