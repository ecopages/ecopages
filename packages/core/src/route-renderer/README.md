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

### `orchestration/`

Framework-owned orchestration services and renderer base class:

- `integration-renderer.ts`: abstract base class that coordinates end-to-end route rendering.
- `render-preparation.service.ts`: page module/data/dependency preparation before render.
- `render-execution.service.ts`: render capture, marker-graph resolution, and finalization.

It also provides:

- `renderToResponse()` contract for explicit-route rendering.
- `renderComponent()` contract for component-level orchestration and artifact reporting.
- marker graph resolution for nested cross-integration component boundaries.

### `component-graph/`

Component marker contracts and graph resolution:

- `createComponentMarker()` for canonical `<eco-marker ...></eco-marker>` generation.
- `parseComponentMarkers()` for marker extraction from rendered HTML.
- node collection by marker id.
- parent/child edges from slot reference registry.
- topological levels for bottom-up execution.

### `page-loading/`

Service for loading page modules and deriving page data:

- `importPageFile()` runtime-aware loading.
- `resolvePageModule()` normalizes exports and statics.
- `resolvePageData()` resolves static props then metadata.

Builds processed assets from component dependency declarations:

- Scripts/styles/components/modules.
- Lazy dependency grouping and trigger derivation.
- Default global injector behavior with optional legacy scripts-injector compatibility.

## Rendering Behavior

Default behavior:

- marker-graph component orchestration + component render artifacts.
- global lazy trigger map + global injector bootstrap.

Global injector lifecycle notes:

- The bootstrap remains active across client-side navigations.
- On `eco:after-swap`, it prunes stale `ecopages/global-injector-map` scripts and calls `refresh()` so newly swapped `data-eco-trigger` elements can bind their lazy rules.
- It must not call injector `cleanup()` on every swap, because that permanently disables future refresh work for the current runtime instance.

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
- The emitted hydration bootstrap also listens for `eco:after-swap` so islands hydrate correctly when their SSR markup appears after client-side navigation.
- React hydration bootstraps are emitted with `data-eco-rerun` and stable `data-eco-script-id` metadata so head-script reconciliation can safely re-execute them when needed.
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
