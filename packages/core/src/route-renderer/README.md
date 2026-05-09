# Route Renderer Architecture

This folder contains the core rendering orchestration for Ecopages.

## Purpose

The route renderer layer is responsible for:

- selecting the correct integration renderer for a route
- loading page modules and resolving static data or metadata
- resolving component dependencies and page browser assets
- coordinating mixed-integration rendering
- emitting final HTML plus cache strategy

## Core Concepts

The architecture is organized around three distinct concepts:

- `ownership`: preparation-time metadata that describes which integration owns each declared component edge
- `foreign child`: a component encountered during render whose owning integration differs from the current integration
- `foreign subtree`: the resolved HTML, assets, and root-attachment metadata returned by the owning renderer for that foreign child

These concepts intentionally live in different places:

- `ownership-planning.service.ts` builds `ownershipPlan`
- `ownership-validation.service.ts` validates declared foreign ownership up front
- `component-render-context.ts` intercepts foreign children during active component render
- `queued-foreign-subtree-resolution.service.ts` resolves queued foreign subtrees for renderers that cannot hand them off inline
- `integration-renderer.ts` owns renderer-to-renderer delegation and shared shell composition
- `route-render-flow.ts` owns route preparation, final response capture, and unresolved artifact enforcement

## Main Files

### `route-renderer.ts`

- `RouteRendererFactory` chooses integration renderers from route files
- `RouteRenderer` delegates execution to the selected renderer

### `orchestration/`

- `route-render-flow.ts`: one route render from page-module loading through final HTML output
- `integration-renderer.ts`: abstract base class for route rendering, explicit view rendering, and foreign-child delegation
- `ownership-planning.service.ts`: declared ownership graph construction
- `ownership-validation.service.ts`: up-front ownership validation for route roots and declared descendants
- `component-render-context.ts`: active render context used by `eco.component()` to intercept foreign children
- `queued-foreign-subtree-resolution.service.ts`: queue resolution for renderers that need token-based foreign-subtree handoff
- `render-output.utils.ts`: unresolved artifact normalization and marker inspection

### `page-loading/`

- `page-module-loader.ts`: imports page modules and normalizes page exports
- `dependency-resolver.ts`: resolves component dependencies and browser-facing assets

## Render Flow

The route-render contract is:

1. `RouteRendererFactory` selects the owning integration renderer.
2. `IntegrationRenderer.execute()` delegates preparation and finalization to `RouteRenderFlow`.
3. `RouteRenderFlow.prepareRenderOptions()` loads the page module, validates ownership, builds `ownershipPlan`, resolves page data, resolves dependencies, and builds the page browser graph.
4. The integration renderer performs page, layout, and document-shell rendering. When it encounters a foreign child, it delegates that child back to the owning renderer.
5. If a renderer needs queued handoff, it emits internal foreign-subtree tokens and resolves them before returning final HTML.
6. `RouteRenderFlow.execute()` captures the final body, rejects unresolved `<eco-marker>` artifacts, stamps root or document attributes when needed, and runs the HTML transformer.

Important:

- route-level fallback resolution is gone; unresolved artifacts are now a hard failure
- ownership is declared from component metadata, not inferred from final HTML
- same-integration children stay renderer-local and do not need to pass through a universal transport

## Declared Foreign Child Contract

Mixed-integration component configs must declare every possible foreign child in `config.dependencies.components`.

That declaration is used for two things:

- `OwnershipValidationService` surfaces missing metadata or unknown integrations before render execution
- `OwnershipPlanningService` records the expected ownership shape in `ownershipPlan`

At runtime, renderers still discover actual foreign children through the active component render context.

## Foreign Subtree Contract

`renderForeignSubtree()` is the compatibility contract for renderer-to-renderer handoff. It returns:

- `html`
- `assets`
- `rootTag`
- optional `rootAttributes`
- `attachmentPolicy`
- `integrationName`

`renderComponentWithForeignChildren()` is the higher-level renderer entrypoint. It is responsible for:

- reusing the execution-scoped owning-renderer cache
- deciding whether the current component can stay local
- creating a foreign-child runtime when nested foreign ownership must be resolved
- normalizing unresolved artifact HTML before the render leaves the renderer

## Queue Model

Not every integration needs queue-based handoff.

- If a renderer can resolve a foreign child inline, it returns resolved output immediately.
- If it cannot, it may emit internal foreign-subtree tokens and resolve them before returning final HTML.
- The queue service is only for renderer-owned transport inside one render pass. It is not a general route-level fallback mechanism.

## React Island Notes

- React islands are emitted without synthetic wrapper elements.
- The React integration attaches `data-eco-component-id` to the SSR root when a single root exists.
- The island bootstrap mounts with `createRoot()` into that SSR root.
- Hydration bootstraps listen for `eco:after-swap` so islands hydrate after client-side navigation.

## Current Limits

- `ownershipPlan` is still diagnostic and preparatory metadata; it does not yet drive a full route-composer execution model.
- Different integrations still own different foreign-child runtime strategies, which is intentional where child transport or hydration behavior differs.
