# Changelog

All notable changes to `@ecopages/react` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

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

### Refactoring

- Aligned React renderer to full orchestration mode — removed legacy rendering path (`fc07bdb0`).
- Ambient module declarations cleaned up (`5f46ecc5`).
- Client graph boundaries and runtime dependency wiring corrected (`4b6cd32e`).
- Updated test suite for esbuild adapter and Node.js runtime compatibility (`31a44458`).

### Bug Fixes

- Inlined the React MDX loader so React apps no longer need to install `@ecopages/mdx` when enabling React MDX support (`unreleased`).
- Fixed stale temp module race during Fast Refresh cycles (`b2cf8466`).
- Fixed client graph boundary wiring for runtime dependencies (`4b6cd32e`).
- Fixed shared React barrel handling so client-reachable server-only re-exports now fail the build instead of being silently pruned (`unreleased`).

### Documentation

- Documented the React integration server/client graph contract for shared modules and barrel exports (`unreleased`).

### Tests

- Added `html-boundary.test.ts` covering boundary wrapping utilities.
- Added `hydration-scripts.test.ts` with hydration script generation coverage.
- Added `reachability-analyzer.test.ts` (187 lines) covering export declaration reachability.
- Updated integration tests for esbuild adapter compatibility (`31a44458`).

---

## Migration Notes

- The React integration now requires explicit client boundary declarations. Components that should be hydrated client-side must be marked at a boundary entry point.
- The internal service layer (`ReactRuntimeBundleService`, `ReactBundleService`, etc.) is not part of the public API and may change between releases.
