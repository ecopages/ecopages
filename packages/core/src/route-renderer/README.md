# Route Renderer Architecture

This folder contains the core rendering orchestration for Ecopages.

## Purpose

The route renderer layer is responsible for:

- Selecting the correct integration renderer for a route.
- Loading page modules and resolving static data/metadata.
- Resolving and processing component dependencies.
- Applying full orchestration.
- Emitting final HTML body output plus metadata/cache strategy.

## Main Components

### `route-renderer.ts`

- `RouteRendererFactory` chooses integration renderers based on route file extension.
- `RouteRenderer` delegates route execution to the selected integration renderer.

### `integration-renderer.ts`

Abstract base class that coordinates end-to-end route rendering:

1. Resolve page module and page data.
2. Resolve and process component dependencies.
3. Add route-level assets and orchestration assets.
4. Render HTML via integration-specific `render()`.
5. Inject processed assets into final HTML through `HtmlTransformerService`.

It also provides:

- `renderToResponse()` contract for explicit-route rendering.
- `renderComponent()` contract for component-level orchestration and artifact reporting.
- marker graph resolution for nested cross-integration component boundaries.

### `component-marker.ts`

Defines marker token contract for component-level orchestration:

- `createComponentMarker()` for canonical `<eco-marker ...></eco-marker>` generation.
- `parseComponentMarkers()` for marker extraction from rendered HTML.

### `component-graph.ts`

Builds a deterministic DAG from marker nodes:

- node collection by marker id.
- parent/child edges from slot reference registry.
- topological levels for bottom-up execution.

### `component-graph-executor.ts`

Resolves graph levels in reverse order (leaf to root) and replaces markers with rendered HTML via integration `renderComponent()`.

### `page-module-loader.ts`

Service for loading page modules and deriving page data:

- `importPageFile()` runtime-aware loading.
- `resolvePageModule()` normalizes exports and statics.
- `resolvePageData()` resolves static props then metadata.

### `dependency-resolver.ts`

Builds processed assets from component dependency declarations:

- Scripts/styles/components/modules.
- Lazy dependency grouping and trigger derivation.
- Default global injector behavior with optional legacy scripts-injector compatibility.

## Rendering Behavior

Default behavior:

- marker-graph component orchestration + component render artifacts.
- global lazy trigger map + global injector bootstrap.

## Current Component Artifact Contract

Integration `renderComponent()` returns `ComponentRenderResult` with:

- `html`
- `canAttachAttributes`
- `rootTag`
- `integrationName`
- optional `rootAttributes`
- optional `assets`

Current base orchestration behavior:

- Calls `renderComponent()` for the page root component.
- Merges returned `assets` into processed dependencies.
- Applies returned `rootAttributes` to the first element under `<body>`.

When rendered output contains `eco-marker` nodes:

- builds marker graph using `componentGraphContext` (`propsByRef`, `slotChildrenByRef`) from integration-specific page module exports.
- resolves markers bottom-up through integration-specific `renderComponent()` calls.
- fails fast when marker component refs or props refs are missing.
- merges marker-rendered assets back into the dependency pipeline with deduplication.

This enables island-style hydration assets (for example React/Lit/Kita integration outputs) to be emitted through the normal dependency injection pipeline.

## React Island Boundary Notes

- React component-level islands are emitted without synthetic wrapper elements.
- The React integration attaches `data-eco-component-id` on the component's own SSR root element when a single root is available.
- Island client bootstrap mounts with `createRoot()` into that root boundary.
- This keeps authored DOM shape stable for global layout/style selectors while preserving per-island runtime isolation.

## Output Pipeline (High-Level)

1. Factory selects integration renderer.
2. Integration renderer prepares render options.
3. Dependencies are resolved and processed.
4. Orchestration assets/artifacts are merged.
5. Integration renderer generates HTML body.
6. HTML transformer injects head/body dependencies.
7. Route result returns body + metadata + cache strategy.

## Notes for Future Work

- Expand integration-side marker emission so more nested trees are resolved through graph mode by default.
- Add broader fixtures/e2e for deep multi-level slot graphs.
- Add optional batching by integration per graph level to reduce repeated renderer invocations.
