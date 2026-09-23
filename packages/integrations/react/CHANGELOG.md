# Changelog

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
