---
'@ecopages/lit': patch
'@ecopages/core': patch
---

Load Lit's SSR hydration support as a module of the app's browser graph instead of an inline script that carried its own pre-compiled `lit-html`. Every Lit page loaded two versions of Lit; it now loads one, from the app's install. The module is exported as `@ecopages/lit/hydrate-support`.

An Integration's global scripts now join the production app-wide browser build. `IntegrationPlugin.getIntegrationDependencies()` returns them unprocessed and `refreshResolvedIntegrationDependencies()` reprocesses them in place.
