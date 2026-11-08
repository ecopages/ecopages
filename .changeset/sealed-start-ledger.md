---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/lit': minor
'@ecopages/ecopages-jsx': minor
---

`ecopages start` from a complete build no longer plans routes at boot: it restores the asset ledger, seals it, and serves every Page, explicit view (`ctx.render`) and error page from what `ecopages build` recorded. Boot runs no route data hook and does not grow with the number of routes. A request compiles and writes nothing; a dependency the build did not record fails with "Run `ecopages build` again". A start from the source tree restores no ledger, so it never serves outputs older than its sources.

To make that complete, `ecopages build` now records every dependency it processes, content scripts and stylesheets included, plans the views the server entry imports, bundles a hydrated React Page without the router in the app-wide build, and processes each planned route's dependencies before it writes the ledger. Static export renders each Page with the preparation its plan made, so data hooks still run once per Page, and a route instance that fails to plan fails the build unless the build keeps going past page failures (a route template or an imported view, planned without request props, logs a warning instead). Under a sealed start, a `cache: 'dynamic'` Page whose dependencies appear only at render time, or depend on per-request props, fails with "Run `ecopages build` again" instead of compiling. `processed-assets.json` is now version 3 and no longer lists route instances; run `ecopages build` again before `ecopages start`.

The Lit static-render worker restores the ledger of the build it renders for, so an earlier build in the configured `distDir` no longer breaks Lit Pages.

Breaking for Integration authors: `restoreProductionPageBrowserGraphs` from `@ecopages/core/build` is now `restoreProductionBrowserBuild(appConfig, { seal })`; `IntegrationRenderer.buildGroupedGraphBuildPlan` and `prebuildProductionPageBrowserGraph` are replaced by `planProductionRoutes`, which returns the plan, a `prepare` step and each instance's preparation, and `execute` accepts that preparation; `resolvePageBrowserGraphForFile` and `resolvePageBrowserGraphForRoute` are removed. A `collectPageBrowserGraphContribution` hook now returns a `PageBrowserGraphDeclaration`, which has no `assets`. A `prepareAssetDependencies` hook should return new dependency objects named from their own content, so every batch keys a script the same. `loadEcoPagesConfig` accepts `directories` to replace the configured `distDir` and `workDir`.
