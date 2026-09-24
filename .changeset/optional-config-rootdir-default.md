---
'@ecopages/core': patch
---

`eco.config.ts` may omit `rootDir`; Ecopages defaults it to `process.cwd()` (or the loader `cwd` option). An empty `rootDir` string remains invalid.
