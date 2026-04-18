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
- `render-execution.service.ts`: render capture, unresolved boundary artifact enforcement, and finalization.
- `queued-boundary-runtime.service.ts`: shared queued foreign-boundary runtime used directly by renderer-owned helpers, including string-first renderers.

It also provides:

- `renderToResponse()` contract for explicit-route rendering.
- `renderComponent()` contract for component-level orchestration and artifact reporting.
- deferred boundary resolution for nested cross-integration component boundaries.

### Boundary Tokens

Renderer-owned runtimes may emit internal boundary tokens while they resolve foreign descendants before returning final HTML. If literal `<eco-marker ...></eco-marker>` markup survives to route finalization, it is treated as an unresolved boundary artifact rather than a normal transport mechanism.

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

- renderer-owned component-boundary orchestration + component render artifacts.
- global lazy trigger map + global injector bootstrap.

## Mixed Renderer Mental Model

The current mixed-renderer contract has four phases:

1. `render-preparation.service.ts` builds the route inputs and a conservative `boundaryPlan` from declared component dependencies.
2. The selected integration renderer owns page, layout, document-shell, and explicit-view composition for that route.
3. Renderer-owned boundary runtimes resolve foreign nested components through the owning renderer and exchange a compatibility `renderBoundary()` payload with explicit attachment-policy semantics.
4. `render-execution.service.ts` finalizes the response and fails if unresolved boundary artifact HTML survives the renderer-owned resolution pass.

Important:

- Renderer-owned deferral is intentional. Ecopages does not run a route-level fallback resolver after render completion.
- Boundary ownership is planned from declared component dependency metadata, not inferred purely from rendered HTML.
- Same-integration children do not have to pass through one universal string-only transport. Each renderer keeps its own child transport rules for same-integration trees.

## Declared Foreign Child Contract

Mixed-integration component configs must declare every possible foreign child in `config.dependencies.components`. The planning pass uses those declarations to describe ownership transitions and surface invalid or unknown foreign owners before render execution.

Current behavior:

- Missing or unknown ownership is recorded on the route `boundaryPlan` as validation errors.
- Renderer-owned runtime discovery still resolves actual foreign descendants during render.
- If unresolved boundary artifact HTML reaches route finalization, Ecopages throws instead of attempting a route-level recovery pass.

Global injector lifecycle notes:

- The bootstrap remains active across client-side navigations.
- On `eco:after-swap`, it prunes stale `ecopages/global-injector-map` scripts and calls `refresh()` so newly swapped `data-eco-trigger` elements can bind their lazy rules.
- It must not call injector `cleanup()` on every swap, because that permanently disables future refresh work for the current runtime instance.

## Boundary Payload Contract

The compatibility boundary API is `renderBoundary()`. Today it wraps the existing `renderComponentBoundary()` behavior and returns a narrower payload:

- `html`
- `assets`
- `rootTag`
- `integrationName`
- optional `rootAttributes`
- `attachmentPolicy`

`renderComponent()` still returns `ComponentRenderResult` internally, including `canAttachAttributes`, because renderer-local implementations have not been collapsed into one universal boundary primitive.

Base orchestration uses the compatibility payload to:

- keep queued foreign-boundary resolution renderer-owned
- apply root attributes only when `attachmentPolicy.kind === 'first-element'`
- preserve asset bubbling through the normal dependency pipeline

The lower-level `ComponentRenderResult` currently includes:

- `html`
- `canAttachAttributes`
- `rootTag`
- `integrationName`
- optional `rootAttributes`
- optional `assets`

When rendered output still contains unresolved boundary artifact HTML:

- route execution now fails fast instead of attempting any route-level unresolved-boundary fallback.
- renderer-owned boundary runtimes are responsible for resolving foreign nested components before final route HTML is returned.

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

## Current Limits And Near-Term Work

If you are reading this file to understand today's contract, you can stop at the output pipeline above. The items below describe areas still evolving rather than required behavior.

- Deep multi-level mixed-integration trees now rely on renderer-owned boundary runtimes rather than a shared post-render graph resolver.
- Each renderer still decides how to hand off foreign boundaries, so specialized runtimes remain appropriate where child serialization or hydration contracts differ.
- `boundaryPlan` is currently preparation-time metadata and diagnostics. It does not yet drive a separate route-composer execution model.
- A dedicated route composer is still deferred until the boundary contract proves stable enough to justify splitting more logic out of `IntegrationRenderer`.
