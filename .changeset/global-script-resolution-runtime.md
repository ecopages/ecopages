---
'@ecopages/core': minor
'@ecopages/lit': patch
---

The app runtime now fixes when activation resolves Integration global scripts: `AppRuntime.globalScriptResolution` is `'browser-build'` for a production export (`ecopages build`, or `ecopages preview` without `--serve-only`) and the Lit static-render worker, and `'activation'` otherwise. No activation call chooses it any more, so whichever caller activates first, a production build bundles no global script on its own into `dist/client`. A process that builds without those commands, such as a test, passes `globalScriptResolution: 'browser-build'` to `loadEcoPagesConfig()` or `finalizeEcoPagesConfig()`; static generation, `emitProductionServerModules()` and the public `resolveIntegrationDependencies()` from `@ecopages/core/build` now throw on any other runtime. After `resolveIntegrationDependencies()` has run, a later activation on the same runtime, such as `app.fetch()` after a build, resolves global scripts at activation again.

Each `IntegrationPlugin.setup()` now empties the resolved global-script list in place, so a second build in the same process does not see the previous one's assets. `resolvedIntegrationDependencies` is `protected readonly`: a subclass that reassigned it updates the array in place or calls `refreshResolvedIntegrationDependencies()` instead.
