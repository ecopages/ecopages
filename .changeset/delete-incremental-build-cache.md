---
'@ecopages/core': minor
---

Production builds no longer carry the incremental build cache. Every build runs in a fresh process, so no cached output, fingerprint, or core version check could match; `ecopages build` already emptied `dist` and rendered every page from source. The build now says so in code: it empties `dist` without consulting a manifest, no longer writes or reads `.build-cache.json`, and the unified pages graph and route-module transpile cache stay in memory for the current process. `ECOPAGES_UNIFIED_PAGES_GRAPH=0` still turns the unified graph off; `=1` never changed anything and is no longer read.

**Breaking:**

- `StaticExportContext` no longer has `preserveExportDirectory`, which was always `false`. Integrations that read it in `beforeStaticExport` or `afterStaticExport` should drop the check.
