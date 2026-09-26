# Changelog

## 0.2.0-rc.13

### Patch Changes

- Updated dependencies [[`6f8bc45`](https://github.com/ecopages/ecopages/commit/6f8bc45ab759638dc447d71e71921cde16c67508)]:
    - @ecopages/core@0.2.0-rc.13

## 0.2.0-rc.12

### Patch Changes

- [#344](https://github.com/ecopages/ecopages/pull/344) [`2af8ec9`](https://github.com/ecopages/ecopages/commit/2af8ec9d741fa97422ea0019af5543b70bc5cf94) Thanks [@andeeplus](https://github.com/andeeplus)! - Each MDX loader now owns its compile cache, keyed by file path and reused while the source is unchanged. This replaces a process-wide cache keyed by a serialized fingerprint of the compiler options. Plugin options that hold RegExps, Maps or circular values no longer collide or throw, and memory stays bounded by the number of MDX files.

    React now reuses its single MDX loader for server builds, browser bundles and HMR rebuilds instead of creating one per build. Custom code that set `ReactRendererConfig.mdxCompilerOptions` should pass `getMdxLoaderPlugin` instead.

- Updated dependencies [[`7a2bce8`](https://github.com/ecopages/ecopages/commit/7a2bce80b9fc69bcc33a9638bb66a682d42399ec), [`dc0cb56`](https://github.com/ecopages/ecopages/commit/dc0cb56357df65a00562af331fb6d65e0b0c1879)]:
    - @ecopages/core@0.2.0-rc.12

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

- [#342](https://github.com/ecopages/ecopages/pull/342) [`926f37d`](https://github.com/ecopages/ecopages/commit/926f37d79c79796e747a7eef7b504f56180a42cd) Thanks [@andeeplus](https://github.com/andeeplus)! - Stop registering the JSX MDX loader twice on Bun, and include compiler plugin functions in the MDX transform cache key so swapping remark/rehype/recma plugins no longer reuses a stale compile.
- Updated dependencies [[`092502a`](https://github.com/ecopages/ecopages/commit/092502aa9cd169e7a03a7bb97d7f16685c9c7146), [`f09227f`](https://github.com/ecopages/ecopages/commit/f09227f22184ceebf577a8227b38df42a77f46eb), [`6fb4725`](https://github.com/ecopages/ecopages/commit/6fb4725ea4fcf0ea1773bfadcd154702434e0502), [`bcbda3d`](https://github.com/ecopages/ecopages/commit/bcbda3df0bbbe57e85a57789bbbb92c881053f9a), [`faa6221`](https://github.com/ecopages/ecopages/commit/faa622198dc55677b309bb2e4e7ae7c96677886f), [`f815c41`](https://github.com/ecopages/ecopages/commit/f815c411772048af88c3319561a35af6def9a430)]:
    - @ecopages/core@0.2.0-rc.11

## 0.2.0-rc.10

### Patch Changes

- Updated dependencies [[`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1), [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5), [`f669755`](https://github.com/ecopages/ecopages/commit/f669755186973edd702c78d8d9e0e726f982b3a8), [`c3c2331`](https://github.com/ecopages/ecopages/commit/c3c2331ee88fb9b383a384e3d35568876c1d9fd3)]:
    - @ecopages/core@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- [#286](https://github.com/ecopages/ecopages/pull/286) [`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d) Thanks [@andeeplus](https://github.com/andeeplus)! - Enforce content-entry ownership for integration-compiled MDX and fix the React MDX loader filter fallback.

    - `@ecopages/mdx/core`: `resolveMdxCompilerOptions` now uses the integration's declared `mdx.extensions` as `mdxExtensions`, replacing any `compilerOptions.mdxExtensions` instead of merging them. Enabling React MDX with only `extensions: ['.react.mdx']` no longer claims or miscompiles plain `.mdx` entries, including when compiler options still list `.mdx`.
    - `@ecopages/content-processor`: the generated `getComponent()` now throws a clear ownership error before invoking an MDX entry compiled by one integration inside another integration's render tree, instead of silently serializing the component as `[object Object]`. The scanner matches collection `extensions` longest-first, so multi-dot extensions such as `.radiant.mdx` and `.react.mdx` produce clean slugs regardless of declaration order.
    - `@ecopages/core`: component renders always execute under a render context that names the rendering integration, which lets cross-integration ownership guards detect a foreign render lane even when no foreign-child runtime is installed.

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Standalone `mdxPlugin()` now **requires** `compilerOptions.jsxImportSource` (no `@kitajs/html` default).
- Standalone `mdxPlugin()` rejects `react` and `@ecopages/jsx` — use `reactPlugin({ mdx: { enabled: true } })` or `ecopagesJsxPlugin({ mdx: { enabled: true } })`.
- Dropped `@kitajs/html` peer from standalone MDX. Shared loader utilities live in `@ecopages/mdx/core`.

### Features

- Added standalone non-React MDX server rendering with async compilation and opt-in `.md` support.

### Bug Fixes

- Fixed loader registration, Node `source-map` interop, and renderer-owned mixed foreign-subtree rendering for standalone MDX routes.
- Discovered MDX stylesheets stay on Component identity until collection; they are not copied into `config.dependencies.stylesheets`.

---

## Migration Notes

- Use `reactPlugin({ mdx: { enabled: true } })` for React-backed MDX routes; the standalone `@ecopages/mdx` plugin now targets non-React JSX runtimes.
- Standalone MDX requires an explicit compiler target, for example:

```ts
mdxPlugin({
	compilerOptions: {
		jsxImportSource: '@kitajs/html',
	},
});
```
