---
'@ecopages/core': patch
'ecopages': patch
---

`ecopages dev` now restarts when a project file that `eco.config.ts` imports changes, not only when the config or dotenv files change. Plugin option edits take effect without a manual restart. Components and helpers the config imports lose hot reload.
