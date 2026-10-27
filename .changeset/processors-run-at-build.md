---
'@ecopages/core': minor
---

`ecopages build` emits each Processor's runtime output into `dist/.server/` and registers it in `server-modules.json`, including content collection manifests and server modules. `ecopages start` restores that output and does not call Processor `setup()`. Invalid collection frontmatter fails the build. Development still regenerates collections when an MDX file is edited.

This is a breaking change: production no longer scans sources or writes under `.eco/` in Processor `setup()`. A Processor that needs request-time modules lists them with `listProductionServerModuleEntries()` and restores them with `restoreProductionRuntime()`.
