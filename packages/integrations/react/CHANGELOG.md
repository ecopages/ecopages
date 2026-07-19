# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking

- `@ecopages/mdx` is now a normal runtime dependency (replaces vendored `@ecopages/mdx-core` / `bundleDependencies`). Consumers do not need to add it manually; npm installs it transitively.

### Bug Fixes

- Fixed React Router MDX server-module builds to keep package imports external so preview/static route probes do not inline framework dependencies into generated `.server-modules-react-mdx` outputs.
- Fixed React HMR dependency-hit handling to rebuild the page cohort when a changed component is only reachable through an owned layout entrypoint.
- Grouped router-managed React page entries and HMR rebuilds so persisted layouts and context providers stay on one shared module graph during cross-route navigation.
- Fixed router-managed React dev page entries to rewrite grouped shared chunk imports to served `/_hmr` asset URLs during initial registration and HMR rebuilds.
- Kept non-page React HMR entrypoints such as island component entries on the per-entrypoint rebuild path while page-route cohorts use grouped page HMR builds.
- Rewrite bare React runtime imports to vendor asset URLs for router-managed hosted start builds instead of leaving unresolved `react` specifiers in emitted page assets.

- Fixed router-managed production React hydration to reuse the shared vendor React runtime instead of bundling a second page-local copy.
- Fixed router-managed production page bundles to emit shared chunks for reused layout/client graphs so heavy modules like Tone are not reinitialized on navigation.
- Fixed full-document `renderToResponse()` hydration asset resolution to reuse the shared Page Browser Graph path instead of a renderer-local builder seam.
- Fixed React MDX page-module loading under Node-style ESM builds so compiled MDX routes resolve emitted `.mjs` outputs instead of assuming `.js` runtime artifacts.
- Fixed React MDX loader initialization under the Node `tsx` runtime by resolving the internal loader helper through static imports instead of lazy module imports.
- Fixed React HMR ownership matching so non-React compound template files like explicit `.kita.tsx` server views no longer emit stale React module updates instead of full route reloads.
- Fixed router-managed React HMR page entries to reload the active route with a cleared persisted-layout cache so shared layout edits apply while the current page stays mounted.
- Fixed router-managed React HMR handlers to forward the active page HMR entry when reloading the current route through React Router.
- Fixed production React route hydration bundles to inline React runtime dependencies and import the router through the emitted page browser graph instead of a published import-map key.
- Fixed React browser bundles to resolve `use-sync-external-store/shim*` through runtime-manifest vendor mappings, including a dedicated vendor runtime for `with-selector`, instead of relying on a bespoke shim build plugin.
- Removed the redundant React page props bootstrap script so route hydration relies on the canonical `__ECO_PAGE_DATA__` payload.
- Fixed React hydration, Fast Refresh, module loading, doctype handling, island asset reuse, and mixed-renderer foreign-subtree resolution across Bun, Vite, and Nitro flows.
- Restored direct `ReactPlugin` construction so the exported class still accepts the public plugin options shape.
- Fixed React foreign-subtree payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Features

- Added background React HMR entrypoint prewarm at dev startup with grouped Rolldown batches, registrar seeding, and cross-session disk cache reuse.
- Auto-vendor npm packages reachable from `eco.layout()` client render graphs under configured `layouts/` and `components/` directories when `router` is enabled; optional `runtimeModules` overrides manual entries for the same specifier.
- Added nested layout arrays on `eco.page()` with unified React SSR composition via `composeDocumentShell` `composeChildren`.
- Added `composeLayoutPageTree` and `serializePageDataScript` exports for shared client/SSR layout and hydration payloads.
- Added per-tier `persistLayouts` support in `@ecopages/react-router` for nested layout stacks.
- Added built-in React MDX support and reachability-based hydration analysis for React page bundles.
- Added the `@ecopages/react/eco-embed` helper for React-owned mixed-integration authoring on top of `eco.embed()`.

### Refactoring

- Collapsed React route hydration into one page-owned entry module that re-exports the page component and bundles runtime dependencies in production.
- Removed the router adapter `importMapKey` contract so both development and production route hydration follow the router bundle import path instead of split import-map and bundle-path models.
- Replaced the positional `ReactHmrStrategy` constructor with an options object so React HMR wiring can evolve without argument-order churn.
- Renamed the remaining React runtime alias internals away from `specifierMap` terminology now that import-map-era core seams are gone.
- Consolidated React bundling, hydration, and runtime state behind shared service boundaries and `window.__ECO_PAGES__`.
- Moved React plugin option/default resolution into the factory and replaced renderer static config with instance-owned runtime wiring.
- Extracted React page-payload and locals serialization into a dedicated service to keep the renderer focused on orchestration.
- Centralized recursive React component-config traversal so module discovery and MDX SSR-lazy asset collection no longer reimplement graph walking.
- Moved MDX config dependency resolution out of the renderer into a dedicated React service.
- Collected shared React plugin and renderer config types into a dedicated module while keeping renderer-local runtime types close to implementation.

### Tests

- Added Vitest browser coverage for the React `dynamic()` utility using React Testing Library.
- Added browser execution coverage for the generated React hydration bootstrap, including router ownership registration and page-root cleanup.
- Added renderer-level coverage for the foreign-subtree payload compatibility contract, including non-attachable fragment roots.

### Documentation

- Updated the README to document React-owned mixed boundaries, React MDX setup, SSR client-only constraints, and `runtimeModules` for persisted layout context providers.

---

## Migration Notes

- React MDX support is built in via `reactPlugin({ mdx: { enabled: true } })`. You do not need to install `@ecopages/mdx` separately — it is installed transitively as a dependency of `@ecopages/react`. The standalone `@ecopages/mdx` plugin is for non-React JSX runtimes only.
- For nested route layouts, use `eco.page({ layout: [Outer, Inner] })` (outer → inner). React SSR and `@ecopages/react-router` compose the same stack; with `ecoRouter()`, outer tiers persist across SPA navigation when routes share the same layout key.
- Import `composeLayoutPageTree` from `@ecopages/react/layout-compose` when building custom client or SSR trees that must match router hydration.
