# Changelog

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

- Vendor import rewrite includes configured `runtimeModules`, so library vendors no longer emit bare singleton imports such as `mobx`.
- Fixed React hydration, Fast Refresh, grouped page HMR, router-managed production bundles, and mixed-renderer foreign-subtree resolution across Bun and Vite hosts.
- Fixed React MDX page-module loading and loader initialization under Node-style ESM and `tsx` runtimes.
- Dev transform vendor prebundles register client-graph boundary plugins and redirect framework imports through the browser runtime manifest.

---

## Migration Notes

- React MDX support is built in via `reactPlugin({ mdx: { enabled: true } })`. The standalone `@ecopages/mdx` plugin is for non-React JSX runtimes only.
- For nested route layouts, use `eco.page({ layout: [Outer, Inner] })` (outer → inner). With `ecoRouter()`, outer tiers persist across SPA navigation when routes share the same layout key.
- Import `composeLayoutPageTree` from `@ecopages/react/layout-compose` when building custom client or SSR trees that must match router hydration.
