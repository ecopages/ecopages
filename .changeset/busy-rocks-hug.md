---
'@ecopages/content-processor': minor
'@ecopages/core': minor
'@ecopages/ecopages-jsx': minor
'@ecopages/image-processor': minor
'@ecopages/kitajs': minor
'@ecopages/lit': minor
'@ecopages/mdx': minor
'@ecopages/postcss-processor': minor
'@ecopages/react': minor
---

Simplify the plugin lifecycle contract and move collection builds to the content processor.
Static export also reconciles the Lit render worker with the export base URL when setup used a different runtime origin.

**Breaking:**

- Remove `Processor.collectDevPrewarmPaths()`; the content processor adds its collection paths to `appConfig.devPrewarmPaths` from `setup()`.
- Remove `Processor.invalidateServerArtifacts()` and the core collection-build subpath. Collection module builds and cache invalidation now belong to `@ecopages/content-processor`.
- Remove `prepareBuildContributions()`. Core reads pure `plugins(app)` once during finalization; processors and integrations create needed state in `setup()` or lazily in their build callbacks. The `buildContributionsPrepared` flags and Image processor Lit-worker guard are removed.
- Replace Integration setters `setConfig()`, `setRuntimeOrigin()`, `setHmrManager()`, and `initializeAssetDefinitionService()`, plus `createRendererOptions()`, `attachRendererRuntimeServices()`, and `initializeRenderer()`, with `setup(ctx)` and `createRenderer(base)`. Replace `getHmrStrategy()` with `hmr(ctx)`. `browserRuntimeManifest` is constructor data.
- Replace `beforeStaticExport()` with `staticExport(ctx)`, which may return a release function that core awaits after export.
- Core calls Integration `teardown()` after static-export releases, including when route discovery or generation fails.
- Replace the abstract Processor `process()` contract with optional `transformStylesheet(css, file)`. Replace PostCSS `matchesFileFilter()` with the capability `filter` field.
- Remove the `sourceTransforms` app option and the `EcoSourceTransform`, `mergeSourceTransformPlugins()`, and `getAppSourceTransforms()` APIs. Use build plugins with `transform`; core's component identity transform is now an internal build plugin.
