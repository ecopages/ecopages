---
'@ecopages/core': minor
'@ecopages/lit': patch
---

`IntegrationPlugin.setup()` no longer resolves an Integration's global scripts (`integrationDependencies`). Core's activation resolves them right after a successful `setup()` in dev and `ecopages start`. `ecopages build` and the Lit static-render worker activate with the new `deferGlobalScripts` option of `setupAppRuntimeIntegrations()` and resolve them once their browser build is known, through the new `resolveIntegrationDependencies()` export of `@ecopages/core/build`. A third-party Integration must not read `getResolvedIntegrationDependencies()` inside `setup()`; the list fills after it.

The resolved list is now one array for the Integration's lifetime, updated in place, so a renderer that holds it sees new entries after a teardown and a later setup. `AppRuntime.integrationDependenciesDeferred` is removed.
