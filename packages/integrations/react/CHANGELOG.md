# Changelog

## 0.2.0-rc.13

### Patch Changes

- Updated dependencies [[`6f8bc45`](https://github.com/ecopages/ecopages/commit/6f8bc45ab759638dc447d71e71921cde16c67508)]:
    - @ecopages/core@0.2.0-rc.13
    - @ecopages/mdx@0.2.0-rc.13
    - @ecopages/file-system@0.2.0-rc.13

## 0.2.0-rc.12

### Patch Changes

- [#344](https://github.com/ecopages/ecopages/pull/344) [`2af8ec9`](https://github.com/ecopages/ecopages/commit/2af8ec9d741fa97422ea0019af5543b70bc5cf94) Thanks [@andeeplus](https://github.com/andeeplus)! - Each MDX loader now owns its compile cache, keyed by file path and reused while the source is unchanged. This replaces a process-wide cache keyed by a serialized fingerprint of the compiler options. Plugin options that hold RegExps, Maps or circular values no longer collide or throw, and memory stays bounded by the number of MDX files.

    React now reuses its single MDX loader for server builds, browser bundles and HMR rebuilds instead of creating one per build. Custom code that set `ReactRendererConfig.mdxCompilerOptions` should pass `getMdxLoaderPlugin` instead.

- Updated dependencies [[`7a2bce8`](https://github.com/ecopages/ecopages/commit/7a2bce80b9fc69bcc33a9638bb66a682d42399ec), [`2af8ec9`](https://github.com/ecopages/ecopages/commit/2af8ec9d741fa97422ea0019af5543b70bc5cf94), [`dc0cb56`](https://github.com/ecopages/ecopages/commit/dc0cb56357df65a00562af331fb6d65e0b0c1879)]:
    - @ecopages/core@0.2.0-rc.12
    - @ecopages/mdx@0.2.0-rc.12
    - @ecopages/file-system@0.2.0-rc.12

## 0.2.0-rc.11

### Patch Changes

- [#335](https://github.com/ecopages/ecopages/pull/335) [`bcbda3d`](https://github.com/ecopages/ecopages/commit/bcbda3df0bbbe57e85a57789bbbb92c881053f9a) Thanks [@andeeplus](https://github.com/andeeplus)! - Removed unused public API from `@ecopages/core`:

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

- [#343](https://github.com/ecopages/ecopages/pull/343) [`1b9eb67`](https://github.com/ecopages/ecopages/commit/1b9eb671a61b04a9f8e87838eca96dc7e960040b) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove unused JSX asset-frame collection, unused React HMR script helpers, and redundant `explicitGraph: true` from the React playground and template configs, where a router already hydrates every page.
- Updated dependencies [[`092502a`](https://github.com/ecopages/ecopages/commit/092502aa9cd169e7a03a7bb97d7f16685c9c7146), [`f09227f`](https://github.com/ecopages/ecopages/commit/f09227f22184ceebf577a8227b38df42a77f46eb), [`6fb4725`](https://github.com/ecopages/ecopages/commit/6fb4725ea4fcf0ea1773bfadcd154702434e0502), [`bcbda3d`](https://github.com/ecopages/ecopages/commit/bcbda3df0bbbe57e85a57789bbbb92c881053f9a), [`faa6221`](https://github.com/ecopages/ecopages/commit/faa622198dc55677b309bb2e4e7ae7c96677886f), [`926f37d`](https://github.com/ecopages/ecopages/commit/926f37d79c79796e747a7eef7b504f56180a42cd), [`f815c41`](https://github.com/ecopages/ecopages/commit/f815c411772048af88c3319561a35af6def9a430)]:
    - @ecopages/core@0.2.0-rc.11
    - @ecopages/mdx@0.2.0-rc.11
    - @ecopages/file-system@0.2.0-rc.11

## 0.2.0-rc.10

### Patch Changes

- Updated dependencies [[`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1), [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5), [`f669755`](https://github.com/ecopages/ecopages/commit/f669755186973edd702c78d8d9e0e726f982b3a8), [`c3c2331`](https://github.com/ecopages/ecopages/commit/c3c2331ee88fb9b383a384e3d35568876c1d9fd3)]:
    - @ecopages/core@0.2.0-rc.10
    - @ecopages/mdx@0.2.0-rc.10
    - @ecopages/file-system@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9
    - @ecopages/mdx@0.2.0-rc.9
    - @ecopages/file-system@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8
    - @ecopages/mdx@0.2.0-rc.8
    - @ecopages/file-system@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- [#297](https://github.com/ecopages/ecopages/pull/297) [`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657) Thanks [@andeeplus](https://github.com/andeeplus)! - Preserve server-rendered React Island Hosts during client hydration and keep
  those hosts layout-transparent with `display: contents`.

- [#291](https://github.com/ecopages/ecopages/pull/291) [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7
    - @ecopages/mdx@0.2.0-rc.7
    - @ecopages/file-system@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6
    - @ecopages/mdx@0.2.0-rc.6
    - @ecopages/file-system@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/mdx@0.2.0-rc.5
    - @ecopages/core@0.2.0-rc.5
    - @ecopages/file-system@0.2.0-rc.5

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- `@ecopages/mdx` is now a normal runtime dependency for built-in React MDX support. Consumers do not need to add it manually.
- Removed the router adapter `importMapKey` contract. Development and production route hydration follow the router bundle import path.
- `runtimeModules[].externals` that are not already shared vendors (React, the router bundle, or another `runtimeModules` specifier) now throw at plugin setup.

### Features

- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.
- Added nested layout arrays on `eco.page()` with unified React SSR composition via `composeDocumentShell` `composeChildren`.
- Added `composeLayoutPageTree` and `serializePageDataScript` exports for shared client/SSR layout and hydration payloads.
- Added per-tier `persistLayouts` support in `@ecopages/react-router` for nested layout stacks.
- Auto-vendor npm packages reachable from `eco.layout()` client render graphs under configured `layouts/` and `components/` directories when `router` is enabled; optional `runtimeModules` overrides manual entries.
- Added the `@ecopages/react/eco-embed` helper for React-owned mixed-integration authoring on top of `eco.embed()`.

### Bug Fixes

- Browser `runtimeModules` follow the package ESM/`module` surface and no longer invent named exports from CJS interop; the React vendor still re-exports CJS `jsx` / `jsxs` explicitly.
- Vendor import rewrite includes configured `runtimeModules`, so library vendors no longer emit bare singleton imports such as `mobx`.
- Fixed React hydration, Fast Refresh, grouped page HMR, router-managed production bundles, and mixed-renderer foreign-subtree resolution across Bun and Vite hosts.
- Fixed React MDX page-module loading and loader initialization under Node-style ESM and `tsx` runtimes.
- Dev transform vendor prebundles register client-graph boundary plugins and redirect framework imports through the browser runtime manifest.

---

## Migration Notes

- React MDX support is built in via `reactPlugin({ mdx: { enabled: true } })`. The standalone `@ecopages/mdx` plugin is for non-React JSX runtimes only.
- For nested route layouts, use `eco.page({ layout: [Outer, Inner] })` (outer → inner). With `ecoRouter()`, outer tiers persist across SPA navigation when routes share the same layout key.
- Import `composeLayoutPageTree` from `@ecopages/react/layout-compose` when building custom client or SSR trees that must match router hydration.
