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

- `ownership`: declared component dependency metadata validated before render
- `foreign child`: a component encountered during render whose owning integration differs from the current integration
- `foreign subtree`: the resolved HTML, assets, and root-attachment metadata returned by the owning renderer for that foreign child

These concepts intentionally live in different places:

- `ownership-validation.service.ts` validates declared foreign ownership up front and fails the render on misconfiguration
- `component-render-context.ts` intercepts foreign children during active component render
- `foreign-subtree-execution.service.ts` owns mixed-integration execution policy and queued token resolution
- `document-shell-render.service.ts` composes page, layout, and html template shells with one execution-scoped renderer cache
- `integration-renderer.ts` owns renderer-to-renderer delegation and integration-specific render hooks
- `route-render-orchestrator.ts` owns route preparation, final response capture, and unresolved artifact enforcement

## Build-Time JSX vs Runtime Foreign Children

Mixed-integration apps use two separate mechanisms:

| Layer   | Mechanism                                                         | Purpose                                                                                  |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Build   | `getJsxOwnershipPlugins()` / `getHostScopedJsxOwnershipPlugins()` | Prepend `@jsxImportSource` so bundled `.tsx` files compile with the correct JSX runtime  |
| Build   | `eco-component-meta-plugin`                                       | Prepends the owning integration pragma when injecting `__eco` metadata into native files |
| Runtime | `eco.component()` / `eco.embed()` + foreign-child runtime         | Hand off cross-integration children during SSR                                           |

See [`../build/README.md`](../build/README.md) for the JSX ownership helper split.

## Document shell composition

`composeDocumentShell` in core is the single string-shell primitive for wrapping a primary component with optional layout tiers and an Html template. Integrations may supply an optional `composeChildren` hook to replace sequential string wrapping with a unified tree (for example React element children) while still delegating foreign subtrees through `renderComponentWithForeignChildren`.

## Main Files

### `route-renderer.ts`

- `RouteRendererFactory` chooses integration renderers from route files
- `RouteRenderer` delegates execution to the selected renderer

### `orchestration/`

Root renderer classes:

- `integration-renderer.ts`: abstract base class for route rendering, explicit view rendering, and foreign-child delegation
- `string-markup-renderer.ts`: shared base for string-markup integrations

Domain folders:

- `ownership-graph/`: component graph walk/collect and up-front ownership validation
- `foreign-child/`: active render context, foreign-subtree execution, deferred template serialization
- `document-shell/`: shared page/layout/html shell composition and attribute stamping helpers
- `route-pipeline/`: route preparation, final HTML capture, marker-artifact enforcement
- `page-browser-graph/`: browser asset graph build, session cache, and injector assets

**Page Browser Graph session behavior:**

- In development, each Page Browser Graph is built on first request, cached in `page-browser-graph-session` with generation-safe commits, and invalidated when a tracked dependency changes. Hosts call `prepareHmrFileChange()` before HMR dispatch and defer client broadcasts when no browser subscribers are connected.
- Production static export prebuilds browser graphs from the finalized route list into the in-memory `page-browser-graph-session` via `production-page-browser-graph-prebuild.ts`. Failed exports clear staged production session records so retries cannot reuse partial graph output.
- Integrations activate lazily on first render or graph prebuild via `ensureIntegrationRuntimeReady()`. Processors and loaders still initialize eagerly during `setupAppRuntimePlugins()`.

### `page-loading/`

- `page-module-loader.ts`: imports page modules and normalizes page exports
- `dependency-resolver.ts`: resolves component dependencies and browser-facing assets

## Render Flow

The route-render contract is:

1. `RouteRendererFactory` selects the owning integration renderer.
2. `IntegrationRenderer.execute()` delegates preparation and finalization to `RouteRenderOrchestrator`.
3. `RouteRenderOrchestrator.prepareRenderOptions()` loads the page module, validates ownership (fail-fast), resolves page data, resolves dependencies, and builds the page browser graph.
4. The integration renderer performs page, layout, and document-shell rendering. When it encounters a foreign child, it delegates that child back to the owning renderer.
5. If a renderer needs queued handoff, it emits internal foreign-subtree tokens and resolves them before returning final HTML.
6. `RouteRenderOrchestrator.executePrepared()` captures the final body, rejects unresolved `<eco-marker>` artifacts, stamps document attributes when needed, and runs the HTML transformer.

Important:

- route-level fallback resolution is gone; unresolved artifacts are now a hard failure
- ownership is declared from component metadata, not inferred from final HTML
- same-integration children stay renderer-local and do not need to pass through a universal transport

## Declared Foreign Child Contract

Mixed-integration component configs must declare every possible foreign child in `config.dependencies.components`.

`OwnershipValidationService` surfaces missing metadata or unknown integrations during `prepareRenderOptions()` and throws before render execution starts.

At runtime, renderers still discover actual foreign children through the active component render context.

## Foreign Subtree Contract

`renderComponentWithForeignChildren()` is the renderer entrypoint for mixed-integration trees. It is responsible for:

- reusing the execution-scoped owning-renderer cache
- deciding whether the current component can stay local
- creating a foreign-child runtime when nested foreign ownership must be resolved
- normalizing unresolved artifact HTML before the render leaves the renderer

Queue resolution maps owning-renderer output into the foreign-subtree payload shape via `toForeignSubtreeRenderPayload()` inside `foreign-subtree-execution.service.ts`.

## Queue Model

Not every integration needs queue-based handoff.

- If a renderer can resolve a foreign child inline, it returns resolved output immediately.
- If it cannot, it may emit internal foreign-subtree tokens and resolve them before returning final HTML.
- Queue mechanics live inside `ForeignSubtreeExecutionService`; they are renderer-owned transport inside one render pass, not a general route-level fallback mechanism.

## React Island Notes

- React islands are emitted without synthetic wrapper elements.
- The React integration attaches island host attributes (`data-eco-island`, `data-eco-component-id`, `data-eco-component-key`, `data-eco-props`) to the SSR root when a single root exists.
- Other integrations call `finalizeIslandComponentRender()` from core when a component instance ships client scripts. See `packages/core/src/islands/README.md`.
- The island bootstrap mounts with `createRoot()` into that SSR root.
- Hydration bootstraps listen for `eco:after-swap` so islands hydrate after client-side navigation.

## Current Limits

- Different integrations still own different foreign-child runtime strategies, which is intentional where child transport or hydration behavior differs.
- `integration-renderer.ts` remains the largest integration hook surface even after document-shell extraction.
