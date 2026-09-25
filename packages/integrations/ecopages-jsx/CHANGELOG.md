# Changelog

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

- [#342](https://github.com/ecopages/ecopages/pull/342) [`926f37d`](https://github.com/ecopages/ecopages/commit/926f37d79c79796e747a7eef7b504f56180a42cd) Thanks [@andeeplus](https://github.com/andeeplus)! - Stop registering the JSX MDX loader twice on Bun, and include compiler plugin functions in the MDX transform cache key so swapping remark/rehype/recma plugins no longer reuses a stale compile.
- Updated dependencies [[`092502a`](https://github.com/ecopages/ecopages/commit/092502aa9cd169e7a03a7bb97d7f16685c9c7146), [`f09227f`](https://github.com/ecopages/ecopages/commit/f09227f22184ceebf577a8227b38df42a77f46eb), [`6fb4725`](https://github.com/ecopages/ecopages/commit/6fb4725ea4fcf0ea1773bfadcd154702434e0502), [`bcbda3d`](https://github.com/ecopages/ecopages/commit/bcbda3df0bbbe57e85a57789bbbb92c881053f9a), [`faa6221`](https://github.com/ecopages/ecopages/commit/faa622198dc55677b309bb2e4e7ae7c96677886f), [`926f37d`](https://github.com/ecopages/ecopages/commit/926f37d79c79796e747a7eef7b504f56180a42cd), [`f815c41`](https://github.com/ecopages/ecopages/commit/f815c411772048af88c3319561a35af6def9a430)]:
    - @ecopages/core@0.2.0-rc.11
    - @ecopages/mdx@0.2.0-rc.11

## 0.2.0-rc.10

### Patch Changes

- Updated dependencies [[`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1), [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5), [`f669755`](https://github.com/ecopages/ecopages/commit/f669755186973edd702c78d8d9e0e726f982b3a8), [`c3c2331`](https://github.com/ecopages/ecopages/commit/c3c2331ee88fb9b383a384e3d35568876c1d9fd3)]:
    - @ecopages/core@0.2.0-rc.10
    - @ecopages/mdx@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- [#317](https://github.com/ecopages/ecopages/pull/317) [`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2) Thanks [@andeeplus](https://github.com/andeeplus)! - Register `ssr: true` custom-element scripts on Node through the page server-module loader. The dev asset pipeline still points at TypeScript source, so the previous Node preload never ran and hosts rendered as empty tags.
- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9
    - @ecopages/mdx@0.2.0-rc.9

## 0.2.0-rc.8

### Minor Changes

- [#310](https://github.com/ecopages/ecopages/pull/310) [`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a) Thanks [@andeeplus](https://github.com/andeeplus)! - # `ssr: true` in `dependencies.scripts` registers custom elements on the server

    ### Summary

    Ecopages JSX preloads `dependencies.scripts` entries with `ssr: true` before SSR on Bun so Radiant (and other registered) custom-element modules run without a duplicate static import in the component file. On Node, registration scripts are evaluated through the normal asset pipeline during render instead of the isolated app-module preload path. Lit preloads lazy `{ src, ssr: true }` entries only so eager scripts are not registered from an isolated graph that would break `@lit-labs/ssr`. Both integrations share `CustomElementScriptPreloader` from `@ecopages/core`.

    Radiant host serialization continues to load through `@ecopages/radiant/server/radiant-element-ssr`.

    ### Migration checklist (LLM / human)
    - [ ] Remove value imports used only for SSR registration: `import './foo.script.ts';`
    - [ ] Keep type-only imports when needed: `import type { FooProps } from './foo.script.ts';`
    - [ ] Add `ssr: true` on the script entry: `{ src: './foo.script.ts', ssr: true }`
    - [ ] Keep `lazy` for browser timing only; server import still runs when `ssr: true` is set
    - [ ] Do **not** add `ssr: true` to browser-only scripts (unguarded `window` / `document`)
    - [ ] String form `scripts: ['./foo.script.ts']` remains browser-only (no server import)

    ### Before

    ```tsx
    import './theme-toggle.script.ts';

    export const ThemeToggle = eco.component({
    	dependencies: {
    		scripts: [{ src: './theme-toggle.script.ts', lazy: { 'on:idle': true } }],
    	},
    	render: () => <theme-toggle />,
    });
    ```

    ### After

    ```tsx
    export const ThemeToggle = eco.component({
    	dependencies: {
    		scripts: [{ src: './theme-toggle.script.ts', ssr: true, lazy: { 'on:idle': true } }],
    	},
    	render: () => <theme-toggle />,
    });
    ```

    ### If SSR host markup is empty
    - Missing `ssr: true` on the registration script, or
    - Script failed to register (check server logs / `ECOPAGES_DEBUG`), or
    - `radiant: false` on the JSX plugin

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8
    - @ecopages/mdx@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- [#291](https://github.com/ecopages/ecopages/pull/291) [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7
    - @ecopages/mdx@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6
    - @ecopages/mdx@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/mdx@0.2.0-rc.5
    - @ecopages/core@0.2.0-rc.5

All notable changes to `@ecopages/ecopages-jsx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added the Ecopages JSX integration with optional Radiant runtime support and optional MDX routes compiled against `@ecopages/jsx`.
- Added the `@ecopages/ecopages-jsx/eco-embed` helper for Ecopages-JSX-owned mixed-integration authoring on top of `eco.embed()`.

### Breaking Changes

- Removed the shared JSX runtime bundle and browser import-map asset in favor of per-script browser entries that prepend `@ecopages/radiant/client/install-hydrator` when Radiant SSR is enabled.
- Intrinsic custom-element loading now follows explicit `dependencies.scripts` ownership instead of implicit tag-to-script discovery.

### Bug Fixes

- Fixed Ecopages JSX SSR/hydration wiring for Radiant hosts, intrinsic custom-element assets, mixed-integration delegated children, and page-owned browser bundles.
- Fixed lazy custom-element dependencies to stay as standalone assets instead of being folded into page-owned bundles.
