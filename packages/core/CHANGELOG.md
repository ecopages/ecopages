# Changelog

## 0.2.0-rc.13

### Patch Changes

- [#345](https://github.com/ecopages/ecopages/pull/345) [`6f8bc45`](https://github.com/ecopages/ecopages/commit/6f8bc45ab759638dc447d71e71921cde16c67508) Thanks [@andeeplus](https://github.com/andeeplus)! - `IntegrationRenderer` now wires queued foreign-subtree resolution itself. Custom integrations call `this.resolveQueuedForeignSubtrees(html, this.getQueuedForeignSubtreeContext(input), renderQueuedChildren)` instead of passing an owner lookup, attribute stamping and asset de-duplication to `resolveQueuedHtml` by hand.

    - `resolveQueuedHtml` no longer takes `queueLabel`, `applyAttributesToFirstElement` or `dedupeProcessedAssets`. Queue errors name the integration, for example `lit`, instead of a label such as `Lit` or `String`.
    - The `@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution` subpath is no longer exported. Use `this.resolveOwningRenderer(...)` from a renderer subclass.
    - `this.htmlTransformer.applyAttributesToFirstElement` is removed; the resolve step stamps root attributes itself.

- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.13
    - @ecopages/file-system@0.2.0-rc.13

## 0.2.0-rc.12

### Patch Changes

- [#344](https://github.com/ecopages/ecopages/pull/344) [`7a2bce8`](https://github.com/ecopages/ecopages/commit/7a2bce80b9fc69bcc33a9638bb66a682d42399ec) Thanks [@andeeplus](https://github.com/andeeplus)! - Persisted build caches now read and parse each shared chunk once per build instead of once per page, and discard entries written before import validation existed.

- [#344](https://github.com/ecopages/ecopages/pull/344) [`dc0cb56`](https://github.com/ecopages/ecopages/commit/dc0cb56357df65a00562af331fb6d65e0b0c1879) Thanks [@andeeplus](https://github.com/andeeplus)! - The `renderQueuedChildren` callback passed to `resolveQueuedHtml` no longer returns `assets`. No built-in integration ever returned any. The owning renderer reports the foreign component's assets, and host components' assets come from their declared dependencies. Return `{ html }`, `{ children }` or `{}`, typed as `QueuedForeignSubtreeChildRenderResult`.
- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.12
    - @ecopages/file-system@0.2.0-rc.12

## 0.2.0-rc.11

### Patch Changes

- [#335](https://github.com/ecopages/ecopages/pull/335) [`092502a`](https://github.com/ecopages/ecopages/commit/092502aa9cd169e7a03a7bb97d7f16685c9c7146) Thanks [@andeeplus](https://github.com/andeeplus)! - Persisted build caches in `.eco` are validated before reuse:

    - A cached page module is reused only while the files it imports still exist, so a partly deleted or interrupted `.eco` folder no longer crashes the build.
    - Page modules are no longer imported from a pages graph that an older build wrote, for example before an upgraded build rebuilds it.

- [#335](https://github.com/ecopages/ecopages/pull/335) [`f09227f`](https://github.com/ecopages/ecopages/commit/f09227f22184ceebf577a8227b38df42a77f46eb) Thanks [@andeeplus](https://github.com/andeeplus)! - Attribute stamping on the `<html>` element, the body root and island roots now uses the HTML rewriter instead of regular expressions:

    - Tags inside comments and scripts no longer match, and `>` inside a quoted attribute value no longer breaks stamping.
    - Quotes in stamped values are escaped.
    - An attribute the element already has is replaced instead of duplicated.
    - Stamped attributes now follow the element's existing attributes.

    HTML dependency injection is also about twice as fast on large pages.

- [#335](https://github.com/ecopages/ecopages/pull/335) [`6fb4725`](https://github.com/ecopages/ecopages/commit/6fb4725ea4fcf0ea1773bfadcd154702434e0502) Thanks [@andeeplus](https://github.com/andeeplus)! - Final HTML injection now uses a built-in streaming rewriter with the same output as Bun's `HTMLRewriter` (lol-html) on every runtime. The `@worker-tools/html-rewriter` dependency and the Node string fallback are gone.

    - `HtmlTransformerService.transform()` now returns the `Response` synchronously. Existing `await` calls still work.
    - Removed `HtmlTransformerService.setHtmlRewriterMode()` and the `HtmlTransformerServiceOptions` constructor options. There is only one rewriter now, so there is nothing to select.

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

- [#335](https://github.com/ecopages/ecopages/pull/335) [`faa6221`](https://github.com/ecopages/ecopages/commit/faa622198dc55677b309bb2e4e7ae7c96677886f) Thanks [@andeeplus](https://github.com/andeeplus)! - Runtime adapter fixes:

    - Bun `start` no longer boots `Bun.serve` in `development` mode or exposes `/_hmr`; both now follow `--dev` only.
    - `app.onError` now receives errors that escape the request pipeline on Node as well as Bun. As on Bun, `app.fetch()` on Node now resolves with the resulting response instead of rejecting, so an embedding host such as Vite no longer receives these errors in its own error middleware.
    - Unhandled request errors are logged with their stack trace instead of a one-line message.
    - A client that disconnects mid-request on Node gets a 499 wherever the abort surfaces, including inside API handlers. It is no longer logged as an error or passed to `app.onError`.
    - Bun's last-resort `error` hook answers with a plain 500 instead of rendering the not-found page.
    - On Node, `attachWebSocketUpgrades(server, { passthroughUnmatched: true })` now honours the option on the first call, so an embedded host such as Vite keeps its own WebSocket upgrades (for example Vite HMR).
    - The Bun preview server answers missing pages with status 404, serves `404.html` with that status, no longer throws when `404.html` is absent, and binds the configured hostname.
    - Dev file-change errors are broadcast to the browser once instead of twice, and non-`Error` throws are logged instead of dropped.
    - A duplicate source transform name now reports a source-transform error instead of a loader error.
    - Removed unused API:
        - the unawaited `clearOutput` app option
        - the app getters `getApiHandlers()`, `getStaticRoutes()`, `getWebsocketHandlers()` and `getErrorHandler()`
        - the deprecated `StartCallback`, `ListenCallback`, `ApplicationListeningCallback` and `ApplicationListeningInfo` types from `@ecopages/core/create-app`; use `OnAppStartCallback` and `AppStartInfo`
        - `BunEcopagesApp.completeInitialization()`
        - the never-read `integrationsDependencies` app config field

- [#330](https://github.com/ecopages/ecopages/pull/330) [`f815c41`](https://github.com/ecopages/ecopages/commit/f815c411772048af88c3319561a35af6def9a430) Thanks [@andeeplus](https://github.com/andeeplus)! - `eco.config.ts` may omit `rootDir`; Ecopages defaults it to `process.cwd()` (or the loader `cwd` option). An empty `rootDir` string remains invalid.
- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.11
    - @ecopages/file-system@0.2.0-rc.11

## 0.2.0-rc.10

### Minor Changes

- [#319](https://github.com/ecopages/ecopages/pull/319) [`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1) Thanks [@andeeplus](https://github.com/andeeplus)! - Add Vite-shaped `defineConfig` and async config loading from `eco.config.ts`. `createApp()` and `ecopages()` load the config when omitted; the CLI accepts `--config`, and production server bundles emit and load `dist/.server/eco.config.mjs`. Author-facing config is `EcoPagesUserConfig` only.

- [#319](https://github.com/ecopages/ecopages/pull/319) [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5) Thanks [@andeeplus](https://github.com/andeeplus)! - Dev servers use `PortManager` for port collisions, with a Clack confirmation on TTY sessions and safe default-port fallback in non-interactive environments. Adding, changing, or removing `eco.config` and supported `.env` files restarts the supervised `ecopages dev` process and reloads dotenv values.

- [#323](https://github.com/ecopages/ecopages/pull/323) [`f669755`](https://github.com/ecopages/ecopages/commit/f669755186973edd702c78d8d9e0e726f982b3a8) Thanks [@andeeplus](https://github.com/andeeplus)! - Add `app.notFound()` and `app.serverError()` view loaders for explicit-route apps, keep filesystem `pages/404.*` and `500.*` as the highest-priority custom error pages, and ship built-in HTML 404/500 defaults with `eco-error-page*` class hooks (development 500 copy button swaps to a check icon, shows “Copied”, and resets). String and URL view registrations load through the server-module transpiler (fixes missing component identity when using raw dynamic `import()`); direct registrations are canonical and the redundant `app.viewModule()` wrapper is removed.

- [#323](https://github.com/ecopages/ecopages/pull/323) [`c3c2331`](https://github.com/ecopages/ecopages/commit/c3c2331ee88fb9b383a384e3d35568876c1d9fd3) Thanks [@andeeplus](https://github.com/andeeplus)! - Preserve valid 4xx and 5xx `HttpError` statuses on HTML page-pipeline responses, normalizing out-of-range values to 500. Semantic pages now cover 400, 401, 403, 404, 409, and 500 (`pages/{status}.*`, `app.errorPage()`, and named helpers), with built-in documents when no custom page exists.

### Patch Changes

- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.10
    - @ecopages/file-system@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- [#317](https://github.com/ecopages/ecopages/pull/317) [`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2) Thanks [@andeeplus](https://github.com/andeeplus)! - Register `ssr: true` custom-element scripts on Node through the page server-module loader. The dev asset pipeline still points at TypeScript source, so the previous Node preload never ran and hosts rendered as empty tags.
- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.9
    - @ecopages/file-system@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

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

- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.8
    - @ecopages/file-system@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- [#297](https://github.com/ecopages/ecopages/pull/297) [`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657) Thanks [@andeeplus](https://github.com/andeeplus)! - Preserve server-rendered React Island Hosts during client hydration and keep
  those hosts layout-transparent with `display: contents`.

- [#291](https://github.com/ecopages/ecopages/pull/291) [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix catch-all request matching so the most specific discovered Page wins, root browser runtime package resolution at the application directory while honoring ESM import conditions, and preserve route-resolved dependency roots through every document-shell renderer.
- Updated dependencies [[`fd16da7`](https://github.com/ecopages/ecopages/commit/fd16da7ae3530dadc5375c6e7a188b905219cfd0)]:
    - @ecopages/dev-toolbar@0.2.0-rc.7
    - @ecopages/file-system@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- [`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix development invalidation for `additionalWatchPaths` and co-located content helpers.

    - `@ecopages/core`: directory and root-relative `additionalWatchPaths` now match contained files, invalidate server modules, notify processors before reload, and bust compiled collection server artifacts via invalidation-versioned output filenames.
    - `@ecopages/content-processor`: watches co-located non-entry files in collection directories and invalidates compiled server collections without attempting frontmatter parsing.

- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.6
    - @ecopages/file-system@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- [#286](https://github.com/ecopages/ecopages/pull/286) [`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d) Thanks [@andeeplus](https://github.com/andeeplus)! - Enforce content-entry ownership for integration-compiled MDX and fix the React MDX loader filter fallback.

    - `@ecopages/mdx/core`: `resolveMdxCompilerOptions` now uses the integration's declared `mdx.extensions` as `mdxExtensions`, replacing any `compilerOptions.mdxExtensions` instead of merging them. Enabling React MDX with only `extensions: ['.react.mdx']` no longer claims or miscompiles plain `.mdx` entries, including when compiler options still list `.mdx`.
    - `@ecopages/content-processor`: the generated `getComponent()` now throws a clear ownership error before invoking an MDX entry compiled by one integration inside another integration's render tree, instead of silently serializing the component as `[object Object]`. The scanner matches collection `extensions` longest-first, so multi-dot extensions such as `.radiant.mdx` and `.react.mdx` produce clean slugs regardless of declaration order.
    - `@ecopages/core`: component renders always execute under a render context that names the rendering integration, which lets cross-integration ownership guards detect a foreign render lane even when no foreign-child runtime is installed.

- Updated dependencies []:
    - @ecopages/dev-toolbar@0.2.0-rc.5
    - @ecopages/file-system@0.2.0-rc.5

All notable changes to `@ecopages/core` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Removed the built-in ghtml Integration, `@ecopages/core/html`, and `@ecopages/core/integrations/ghtml`. Apps must register an Integration that owns their route file extensions.
- `BuildRuntime` profiles no longer inject app plugins. Pass complete `BuildOptions`, including required app plugins and transforms, before calling `getProfile(...).build()`.
- Removed the open index signature from `BuildOptions` and `BrowserBundleOptions`.
- Removed deprecated `config.layout` innermost alias on page configs. Use `config.layouts` and `config.layoutEntries` instead.
- `createAliasResolverPlugin` now takes the app **project root** (not `srcDir`) and resolves aliases from tsconfig `compilerOptions.paths` only. Hardcoded `@/` → `srcDir` mapping is removed.

### Features

- Added `createApp()` as the recommended runtime entrypoint with Bun-first execution and Node fallback.
- Added app-owned build and runtime ownership: host module loading, browser-safe `eco` export, `eco.html()`, `eco.layout()`, and published `EcoPagesAppConfig`.
- Replaced filesystem route discovery with `RouteRegistry` for matching, static-generation planning, and dev reload.
- Added Page Browser Graph orchestration, browser runtime asset manifest, and import rewrite so runtime modules resolve to concrete public URLs.
- Added boundary-plan metadata and mixed-renderer `renderBoundary()` payload contract for cross-integration pages.
- Added `@ecopages/core/dev/host-runtime` for Vite and other host integrations.
- Added `@ecopages/core/plugins/tsconfig-import-resolver` for tsconfig `paths` resolution and bare npm import classification.
- Added nested `layout` arrays on `eco.page()` with normalization to `config.layouts` / `config.layoutEntries`.
- Added `composeChildren` hook on `composeDocumentShell` for integration-owned unified layout+page composition.
- Added `EcoDeclaredComponent` validation for `dependencies.components` entries.
- Direct local Eco Component imports (including named `export { X } from` barrels) and relative side-effect CSS imports supply Dependencies by default. Explicit stylesheet declarations override inferred references to the same resolved file. Inferred styles stay on Component identity until collection, including when server modules bundle a copy of `eco`. Named barrel hops are watch paths so a live retarget invalidates cached page assets.
- `mergePageDependencies()` keeps file-owned contributions (including `modules`) so combining a Page with a content entry cannot re-home relative paths.
- Page HTML cache in watch mode uses Cache Strategy admission on a bounded memory store. Set `cache.enabled: false` to disable watch-mode HTML caching entirely.
- Watch mode SSR-prewarms processor-declared content paths (`routePrefix` + `devPrewarm`). Optional `devPrewarmReadiness: 'beforeReady'` blocks the framework ready signal until prewarm completes. Concurrent prewarm uses `ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM` (default `3`).
- Dev client modules are transpiled per source file on demand with in-memory caching and lazy `/assets/vendors` prebundles.

### Bug Fixes

- Browser `runtimeModules` resolve ESM/`module` entries instead of CJS `require()` export keys; CJS vendor files still emit explicit named re-exports so bindings such as React `jsx` exist on the vendor URL.
- Fixed Node and Bun adapter stability for preview, static generation, HMR, and mixed-integration rendering.
- Fixed grouped page-browser graph builds, foreign-child delegation, page-module import caching, and page dependency packaging across static, dynamic, and HMR flows.
- Fixed dev transform vendor prebundles, browser-target Rolldown builds, and development HMR invalidation for layouts, includes, and script entrypoints.
- Unknown content lookups that throw `HttpError.NotFound` keep that status through page render wrapping.
- Semantic `404.*` / `500.*` templates now receive safe empty `locals` / `pageLocals`.

---

## Migration Notes

- `createApp` is now the recommended entrypoint. Import it from `@ecopages/core/create-app`.
- `defineApiHandler` keeps the same call shape, but the handler context is now explicitly runtime-agnostic.
- `eco.page({ layout })` accepts one layout or an **outer → inner** array. Arrays normalize to `config.layouts` and `config.layoutEntries`.
- Entries in `dependencies.components` (including layouts merged from `eco.page({ layout })`) must be declared with `eco.component()`, `eco.layout()`, or `eco.html()` so `config.identity` is present.
- `DefaultHmrContext` now requires a `getEntrypointDependencyGraph(): EntrypointDependencyGraph` method. Implementations should return the shared `EntrypointDependencyGraph` instance from `@ecopages/core/services/runtime-state/entrypoint-dependency-graph.service`.
