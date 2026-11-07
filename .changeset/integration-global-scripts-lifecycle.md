---
'@ecopages/core': minor
'@ecopages/lit': patch
---

`IntegrationPlugin.setup()` no longer resolves an Integration's global scripts (`integrationDependencies`). Dev, `ecopages build`, `ecopages start` and the Lit static-render worker each resolve them once their browser build is known, through the new `resolveIntegrationDependencies()` export of `@ecopages/core/build`. A third-party Integration must not read `getResolvedIntegrationDependencies()` inside `setup()`; the list fills after it.

The resolved list is now one array for the Integration's lifetime, updated in place, so a renderer that holds it sees new entries after a teardown and a later setup. `AppRuntime.integrationDependenciesDeferred` is removed.
