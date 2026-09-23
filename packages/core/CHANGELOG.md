# Changelog

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
