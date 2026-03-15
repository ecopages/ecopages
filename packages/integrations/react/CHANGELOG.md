# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Fixed React MDX `.md` opt-in routes compiling in plain-markdown mode. When `compilerOptions.mdExtensions` includes `.md`, those files are now parsed as MDX so top-level `import` and `export` statements work correctly.
- Fixed `react-mdx-loader` incorrectly handling `.md` files by default, which caused `.md` pages intended for the standalone `mdxPlugin` (with `@kitajs/html` JSX runtime) to be compiled with React's JSX runtime. The React MDX loader now defaults to only `.mdx` extensions; use `compilerOptions.mdExtensions` to opt in to `.md` handling.

### Features

#### Render Reachability Analysis

- **Client render graph (Phase 1)** — Introduces a static reachability analysis step that builds an explicit graph of which components are rendered client-side (`cdfbd69e`).
- **OXC-powered reachability analyzer** — `reachability-analyzer.ts` uses OXC to parse and walk component ASTs, building a `ClientRenderGraph` that maps exported components to their client-side reach (`5412df6b`).
- **Explicit client graph boundaries** — Components must now declare explicit boundaries; the analyser enforces these to prevent over-hydration (`2912d6bd`).
- **Declared modules utility** — `declared-modules.ts` tracks which modules are declared as client boundaries.

#### Service Architecture Refactor

- **`ReactRuntimeBundleService`** — Manages runtime assets and specifier mapping for the React integration (`cfd3cb05`).
- **`ReactHydrationAssetService`** — Creates and manages hydration assets for client-side rendering (`cfd3cb05`).
- **`ReactBundleService`** — Handles esbuild bundle configuration for React components (`cfd3cb05`).
- **`ReactPageModuleService`** — Loads and compiles MDX/TSX page modules, including config resolution (`cfd3cb05`).
- The integration no longer builds a monolithic renderer — each concern is handled by a focused service.

#### HMR Improvements

- **HMR page metadata caching** — Page metadata is now cached between HMR refreshes, preventing unnecessary re-fetches during Fast Refresh (`a663788c`).
- **Stale temp module race fix** — HMR no longer incorrectly reads a stale temporary module during rapid refresh cycles (`b2cf8466`).
- **Client graph HMR stability** — HMR reloads now correctly respect client graph boundaries to avoid partial hydration mismatches (`2912d6bd`).

#### HTML Boundary Utilities

- **`html-boundary.ts`** — New utility that wraps rendered output in explicit boundary markers for the cross-integration boundary rendering policy (`ec1e4d66`).
- **`hydration-scripts.ts`** — Expanded with new helpers for generating and injecting hydration entry scripts.

### Bug Fixes

- **Fixed React island duplicate DOM** — Island bootstrap now creates an `eco-island` container with `display: block` and calls `createRoot` on it, replacing the SSR element rather than mounting React inside it. This prevents the component root element from being duplicated on client mount.
- **Fixed eco-island CSS regression** — Changed `eco-island` container from `display: contents` to `display: block`. With `display: contents`, the element has no layout box and CSS sibling selectors (e.g. Tailwind `space-y-*`) applied margins to a box-less element, producing no visual effect. With `display: block`, eco-island participates in layout as expected.
- **Fixed island script prop collision** — Component props are now embedded in the SSR element as `data-eco-props` (base64-encoded JSON) and read from the DOM at mount time, rather than being hardcoded in the shared island script. This resolves incorrect props being applied when the same component appeared at the same position on multiple pages, because the script file was shared but overwritten during build.


- Client graph boundaries and runtime dependency wiring corrected (`4b6cd32e`).
- Updated test suite for esbuild adapter and Node.js runtime compatibility (`31a44458`).

### Bug Fixes

- Inlined the React MDX loader so React apps no longer need to install `@ecopages/mdx` when enabling React MDX support (`unreleased`).
- Fixed React component renders to emit island hydration only when an explicit instance id is provided, avoiding implicit island treatment inside fully React pages (`unreleased`).
- Fixed stale temp module race during Fast Refresh cycles (`b2cf8466`).
- Fixed client graph boundary wiring for runtime dependencies (`4b6cd32e`).
- Fixed shared React barrel handling so client-reachable server-only re-exports now fail the build instead of being silently pruned (`unreleased`).
- Fixed page-entry browser bundles to strip server-only `eco.page()` options so unreachable middleware imports do not leave dangling runtime references (`unreleased`).
- Fixed non-router page hydration so layouts receive serialized request locals on the client, preventing mismatches on middleware-backed dynamic pages (`unreleased`).
- Fixed React page hydration bootstrap re-entry so repeated page scripts reuse the existing root instead of re-hydrating the document during fast route handoffs (`unreleased`).
- Fixed React island duplicate DOM — island bootstrap now creates an `eco-island` container with `display: block` that replaces the SSR element, then calls `createRoot` on it. This prevents the component root from being nested inside itself on client mount.
- Fixed eco-island CSS regression — changed `eco-island` container from `display: contents` to `display: block` so the element has a layout box and participates correctly in CSS sibling spacing rules (e.g. Tailwind `space-y-*`).
- Fixed island script prop collision — component props are now embedded in the SSR element as `data-eco-props` (base64 JSON) and read from the DOM at mount time. This resolves incorrect props being used when the same component appeared at the same position on multiple pages, because the generated script file was shared but the hardcoded props were overwritten during build.
- Fixed React page rendering inside explicit non-React HTML/layout shells so `.tsx` and `.mdx` React routes can run inside shared Kita app chrome while preserving React hydration and router handoff.

### Documentation

- Documented the React integration server/client graph contract for shared modules and barrel exports (`unreleased`).
- Expanded the React README with the client graph boundary architecture, AST rewrite order, and hydration `locals` contract (`unreleased`).

### Tests

- Added `html-boundary.test.ts` covering boundary wrapping utilities.
- Added `hydration-scripts.test.ts` with hydration script generation coverage.
- Added `reachability-analyzer.test.ts` (187 lines) covering export declaration reachability.
- Added a React renderer regression test to prevent implicit island hydration for router-backed component renders (`unreleased`).
- Updated integration tests for esbuild adapter compatibility (`31a44458`).

---

## Migration Notes

- The React integration now requires explicit client boundary declarations. Components that should be hydrated client-side must be marked at a boundary entry point.
- The internal service layer (`ReactRuntimeBundleService`, `ReactBundleService`, etc.) is not part of the public API and may change between releases.
