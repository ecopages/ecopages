---
'@ecopages/core': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/mdx': patch
'@ecopages/react': patch
---

Removed unused public API from `@ecopages/core`:

- Subpaths:
    - `@ecopages/core/bun`: use `createApp` from `@ecopages/core/create-app` and the handler helpers from `@ecopages/core`.
    - `@ecopages/core/eco`: import `eco` from `@ecopages/core`.
    - `@ecopages/core/utils/hash`: use `@ecopages/core/hash`.
    - `@ecopages/core/build/build-types`: the build plugin types are exported from `@ecopages/core/plugins/integration-plugin`.
    - `@ecopages/core/hmr/hmr-asset-paths`: import `DEV_TRANSFORM_URL_PREFIX` from `@ecopages/core/dev/transform-server`.
    - Internal modules with no replacement: `build/build-contracts`, `build/production-build-cache`, `build/server-entry-build-cache`, `build/runtime-build-output-normalizer`, `diagnostics/startup-trace`, `hmr/hmr-runtime-paths`, `dev/client-bridge-registry`, `dev-toolbar/dev-toolbar-host`, `dev-toolbar/dev-toolbar-package`, `dev-toolbar/dev-toolbar-runtime-paths`, `plugins/foreign-jsx-override-plugin` and `plugins/alias-resolver-plugin`.
- Root exports:
    - `createEcoBuildPluginFromSourceTransform`, `getAppSourceTransforms` and `normalizeTransformId`: import them from `@ecopages/core/plugins/source-transform`.
    - `mergeLayoutDependencies`: import it from `@ecopages/core/eco/page-layout-normalization`.
    - `attributeComponentIdentity`, `registerDiscoveredDependencies`, `getInferredStylesheets`, `DiscoveredDependencies`, `listFileOwnedDependencyContributions`, `ECO_ISLAND_HOST_ATTRIBUTE`, `ECO_ISLAND_INTEGRATION_ATTRIBUTE`, `isIslandHostElement` and `mergeIslandHostAttributes`.
    - The types `CssProcessor`, `IntegrationPluginDependencies`, `DeepRequired`, `Prettify`, `TypedApiHandlerContext` and `GroupOptions`, and `Error400TemplateProps`, `Error401TemplateProps` and `Error409TemplateProps` (use `ErrorPageTemplateProps`).
- Other members:
    - `IS_BUN` from `@ecopages/core/constants`.
    - `HmrStrategyType.ASSET`; use `INTEGRATION` or `SCRIPT` with a `priorityOffset`.
    - `invalidatedGraphCount` from the `prepareHmrFileChange()` result.
    - `resetRuntimeState()` from the development host runtime.
    - `assertIntegrationInvariant` from `@ecopages/core/plugins/integration-plugin`.
    - `getCollectionServerBuildArtifact` from `@ecopages/core/services/module-loading/collection-server-module-build.service`.
    - `ModuleParseCache`, `moduleParseCache`, `cachedParseSync`, `parserLanguageForFile` and the `ParserLanguage` type from `@ecopages/core/cache`; use `parseModuleSource`.
    - The ignored `outbase` and `bundle` fields of `BuildOptions`.
    - The protected `IntegrationRenderer.applyAttributesToFirstBodyElement()` and `createFailFastForeignChildRuntime()` methods.
    - The `devRuntimeFactory` option of the Node server adapter.
