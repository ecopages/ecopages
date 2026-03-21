# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added Phase 1 client render graph analysis to track client-reachable exports and enforce explicit React hydration boundaries.
- Split React browser and runtime work into focused services for runtime bundles, hydration assets, page modules, and browser bundling.
- Inlined the React MDX loader so React apps can enable MDX without installing `@ecopages/mdx` separately.

### Bug Fixes

- Fixed React island bootstrapping to replace SSR nodes with a block-level `eco-island` container and per-element `data-eco-props` payloads, preventing duplicate DOM and prop collisions.
- Fixed router-backed React pages to emit the canonical `__ECO_PAGE_DATA__` payload and explicit document owner markers so mixed React and non-React navigation and hydration stay aligned.
- Fixed React page hydration and handoff cleanup to use `document.body`, shared navigation coordination, preserved request locals, and stable root reuse across route handoffs.
- Fixed React MDX extension handling so `.md` stays opt-in and shared builds no longer let standalone MDX configuration hijack React `.mdx` routes.
- Fixed client graph boundary wiring so client-reachable server-only re-exports fail fast and page-entry bundles strip unreachable server-only `eco.page()` options.
- Moved React MDX page-module transpilation into the internal work directory so static exports no longer leak `.server-modules-react-mdx` into `distDir`.
- Fixed development React runtime vendor asset naming so concurrent preview/export builds no longer overwrite dev-only JSX runtime helpers such as `jsxDEV`.
- Fixed React MDX declared component dependencies to eagerly emit SSR-marked lazy custom-element scripts so mixed React and Lit pages keep declared custom elements interactive.

### Refactoring

- Moved runtime specifier registration onto the shared integration lifecycle and reused core browser runtime asset and entry helpers instead of React-owned temp entry assembly.
- Centralized React runtime specifier policy and consolidated browser runtime state under `window.__ECO_PAGES__`.

### Documentation

- Expanded the README for client graph boundaries, shared-module rules, AST rewrite order, and hydration `locals`.

### Tests

- Added coverage for client graph reachability, hydration boundary utilities, and the router-backed component-render regression that prevents implicit island hydration.
- Added regression coverage for development React runtime vendor asset naming so dev and preview React bundles stay isolated.

---

## Migration Notes

- The React integration now requires explicit client boundary declarations for client-rendered components.
- React MDX support is built in and no longer requires installing `@ecopages/mdx` just to enable React MDX routes.
- The internal service layer is not part of the public API and may change between releases.
