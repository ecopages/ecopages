# Route Renderer Architecture

**Layer:** Rendering.

This folder contains the core rendering orchestration for Ecopages.

## Purpose

The route renderer layer is responsible for:

- selecting the correct integration renderer for a route
- loading page modules and resolving static data or metadata
- resolving component dependencies and page browser assets through the required app-owned `AssetProcessingService`
- coordinating mixed-integration rendering
- emitting final HTML plus cache strategy

## Core Concepts

The architecture is organized around three distinct concepts:

- `ownership`: declared component dependency metadata validated before render
- `foreign child`: a component encountered during render whose owning integration differs from the current integration
- `foreign subtree`: the rendered HTML returned by the owning renderer for that Foreign Child

These concepts intentionally live in different places:

- `ownership-validation.service.ts` validates declared foreign ownership up front and fails the render on misconfiguration
- `../eco/component-render-context.ts` scopes component renders and exposes the active foreign-child runtime
- `foreign-subtree-execution.service.ts` contains the functions for mixed-integration execution and queued-token resolution
- `document-shell-render.service.ts` composes page, layout, and html template shells with one execution-scoped renderer cache
- `integration-renderer.ts` owns renderer-to-renderer delegation and integration-specific render hooks
- `route-render-orchestrator.ts` owns route preparation, final response capture, and unresolved artifact enforcement. Preparation builds one `PreparedComponentGraph` from the Html, Layout, Page, and resolved page-dependency roots. The graph records each component's owner, source file, direct assets, children, and foreign-descendant state. Ownership validation, route dependency collection, the page client plan, and dev cache watch paths consume that graph instead of walking component configs independently. The client plan contains entries, foreign runtimes, lazy triggers, and island files. Static route-plan preparation collects each node's lazy entries under its recorded owning Integration without processing eager assets, so Foreign Children contribute lazy entries to the app-wide build. `islandEntries` lists components whose Integration differs from their parent's, excluding the Html shell. The page owner's Page, Layout, and nested includes stay on `sourceComponents` so cache invalidation still watches them. Hydrating integrations pass `islandEntries` through `selectHydrationIslandEntries` so only Foreign Children of another owner receive per-component island scripts; the page owner's own tree is hydrated by the page bootstrap. On the non-HMR runtime path outside static export, each page owner contributes a grouped multi-entry browser build (`ecopages-app-browser-client`) for islands and lazy entries, so React islands on a Kita or Lit route still receive hydration scripts. Production static export collects those island and lazy entries together with every renderer's grouped Page Browser Graph entries and HTML shell module scripts into compatible app-wide browser build groups. React hydration entries import the component source inside their group, so compatible entries can share chunks when code splitting is enabled. Preparation adds the resulting assets to the page package, so no renderer starts a per-island build during SSR. Resolved lazy-trigger ids stay on the component config across later dependency passes so serialized foreign-child HTML can still receive `data-eco-trigger`. In the regular grouped build, island entries re-export the source module so the hydration script can import the component; a side-effect-only `import "path"` dropped named exports and left React counters inert.

## Build-Time JSX vs Runtime Foreign Children

Mixed-integration apps use two separate mechanisms:

| Layer   | Mechanism                                                         | Purpose                                                                                                                                        |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Build   | `getJsxOwnershipPlugins()` / `getHostScopedJsxOwnershipPlugins()` | Prepend `@jsxImportSource` so bundled `.tsx` files compile with the correct JSX runtime                                                        |
| Build   | component identity source transform                               | After a lexical `eco.` gate, uses Oxc to wrap native factory options with `bindComponentIdentity()` and prepends the owning integration pragma |
| Runtime | `eco.component()` / `eco.embed()` + foreign-child runtime         | Hand off cross-integration children during SSR                                                                                                 |

See [`../build/README.md`](../build/README.md) for the JSX ownership helper split.

## Document shell composition

`composeDocumentShell` in core is the single string-shell primitive for wrapping a primary component with optional layout tiers and an Html template. Integrations may supply an optional `composeChildren` hook to replace sequential string wrapping with a unified tree (for example React element children) while still delegating foreign subtrees through `renderComponentWithForeignChildren`.

`IntegrationRenderer.render()` owns the common route shell and page-props contract. An Integration that only needs optional rendering behavior can use `createIntegrationRenderer()` with hooks for component rendering, queued children, foreign-child prop normalization, page-module preparation and normalization, Page Browser Graph contributions, shell composition and props, document contributions and attributes, island assets, pre-render setup, route render scoping, document finalization, or final HTML transforms. A hook factory receives the app config, asset service, `resolveDependencies()`, `resolveDependencyPath()`, and `applyPendingLazyTriggers()` once per renderer instance, so it can capture app-owned state and collect assets with core's dependency rules without a renderer subclass. Supplying `buildIslandClientAssets()` marks that Integration as a contributor to grouped app browser builds. Core resolves queued children and finalizes island attributes around a `renderComponent()` hook; the hook returns the component's HTML, whether root attributes can attach, and its root attributes.

### The page package

Route preparation builds the page package once, before any component renders: the Dependencies of every component in the prepared graph, the Page's `dependencies`, the Page Browser Graph, island and lazy-entry builds, and Integration runtimes. Rendering does not change it. Component renders, foreign subtrees and document shell layers return HTML and attributes only, and the HTML transform injects the prepared package's assets. `renderComponent` has no way to add assets: a component's stylesheets and scripts come from its Dependencies, and an Integration adds its own through its integration dependencies or the Page Browser Graph and document contribution hooks.

## Main Files

### `route-renderer.ts`

- `RouteRendererFactory` takes the app config and chooses the owning Integration's shared renderer from a route file or an explicit view's Integration name

### `explicit-view-render-preparation.ts`

`resolveExplicitViewRenderer` resolves the owning Integration's shared renderer for one `eco.page()` view without reading `staticProps`. Static export planning uses that so a dynamic route is not invoked before a slug exists. `prepareExplicitStaticRender` then reads `staticProps` with the route's params. A full explicit view calls `renderExplicitView` (a response) or `executeExplicitView` (the route result with its metadata), which run `execute` with the view as the page module and `skipStaticProps`, so it receives the same layouts, metadata, and page client plan as a filesystem Page but never re-runs `staticProps`. The props, route params, query and locals of the call are visible to the view and to its `metadata`. Static export renders through `executeExplicitView` and reuses the returned metadata for sitemap eligibility. Each `execute` opens a render session for that page's Integration dependencies and foreign-renderer cache, so static export can render several pages of one Integration at the same time. Route rendering, explicit views, and foreign-child handoffs reuse that Integration's renderer. Render contexts use `node:async_hooks` AsyncLocalStorage to isolate nested and concurrent renders; a runtime without it fails before rendering. A partial render stays on the component path and opens its own render session.

### `error-pages/`

Owns semantic HTTP error-page source selection, rendering, built-in fallback documents, and static-export artifacts. Request adapters classify route failures and coordinate the final HTTP response.

### `orchestration/`

Renderer entrypoints:

- `integration-renderer.ts`: shared route pipeline, explicit view rendering, foreign-child delegation, and optional Integration hooks
- `string-markup-renderer.ts`: typed convenience base for string-markup integrations; common rendering behavior lives in `IntegrationRenderer`

Domain folders:

- `ownership-graph/`: the prepared route component graph, its page client plan, ownership validation, and the development check that a rendered component is in the graph
- `foreign-child/`: foreign-subtree execution, opaque-child checks, deferred template serialization
- `document-shell/`: shared page/layout/html shell composition and layout prop resolution
- `route-pipeline/`: route preparation, final HTML capture, marker-artifact enforcement
- `page-browser-graph/`: browser asset graph build, session cache, and injector assets
- `custom-element-scripts/`: shared `ssr: true` script collection and server preload for custom-element registration, with deduplication and invalidation state owned by each `AppRuntime`

**Page Browser Graph session behavior:**

- In development, each Page Browser Graph is built on first request, cached in `page-browser-graph-session` with generation-safe commits, and invalidated when a tracked dependency changes. The per-route fast path is disabled while HMR is enabled so prop-dependent `dependencies(props)` cannot reuse the wrong graph. The Project Watcher batch invalidates the graphs that depend on a changed file before HMR runs, and HMR managers drop client broadcasts when no browser subscribers are connected.
- Dev SSR prewarm schedules processor-declared pathnames for background rendering. Static pages cache in watch mode when their Cache Strategy allows it; dynamic pages are never retained. Each cached page registers its route-module closure, Page Browser Graph, processed assets, and render-shell source paths with the shared build-input index. An edit evicts only the HTML entries that registered the changed file, including the HTML template's imports; an `additionalWatchPaths` edit clears the HTML cache because its consumers are unknown.
- **Measuring dev page load:** set `ECOPAGES_REQUEST_PIPELINE_METRICS=1` and run `pnpm run test:bench:docs`. Compare cold vs warm navigations and phase totals from the benchmark output.
- Production static export gathers every renderer's grouped plan, builds the app-wide browser client once, and writes its route assets, HTML module-script URLs, source fingerprints, and emitted browser output paths to `.server/browser-client-manifest.json`. It also adds a parameter-free plan for every non-exact route template without invoking route data hooks for missing params. Production `ecopages start` reloads the manifest, validates its sources and output files, and prepares its listed route graphs before accepting SSR requests. A request for a new slug still renders through the server and follows the route's cache strategy, including `revalidate`; it reuses the template's emitted browser assets when the grouped dependencies and page-client entries match, and keeps the request-time browser build path if the graph differs. A generation failure clears staged production session records and the manifest so retries cannot reuse partial graph output.
- Core activates Integrations after Processor setup and before the first renderer is created. In watch mode it registers each Integration's HMR behavior first; graph prebuild and render paths join the same coalesced `ensureIntegrationRuntimeReady()` activation. Processors initialize their small virtual modules during `setupAppRuntimePlugins()`; content collection server artifacts are built lazily when a server build first resolves the collection.

### `page-loading/`

- `page-module-loader.ts`: imports page modules and normalizes page exports
- `dependency-resolver.ts`: resolves component dependencies and browser-facing assets

## Render Flow

The route-render contract is:

1. `RouteRendererFactory` selects the owning integration renderer.
2. `IntegrationRenderer.execute()` activates the Integration runtime, gives an optional remote-render hook first refusal, then opens a per-render session and delegates preparation and finalization to `RouteRenderOrchestrator`.
3. `RouteRenderOrchestrator.prepareRenderOptions()` loads the page module and final props, prepares and validates the shell graph, resolves page-dependency roots, then adds and validates those roots in the prepared graph. Route assets, the page client plan, and development cache watch paths reuse its recorded nodes; production grouped prebuild retains that same graph through route preparation. The page browser graph cache identity includes route params and query; contribution collection receives those same final props. When rendering, route params and query take precedence over similarly named extra props.
4. The integration renderer performs page, layout, and document-shell rendering. When it encounters a foreign child, it delegates that child back to the owning renderer.
5. If a renderer needs queued handoff, it emits internal foreign-subtree tokens and resolves them before returning final HTML.
6. `RouteRenderOrchestrator.executePrepared()` captures the final body, rejects unresolved `<eco-marker>` artifacts, stamps document attributes when needed, runs the HTML transformer with the prepared page package, and then lets the Integration's `finalizeDocument` hook reconcile its own document markup.

Important:

- route-level fallback resolution is gone; unresolved artifacts are now a hard failure
- ownership is declared from canonical component identity, not inferred from final HTML
- declared page dependencies are resolved from final render inputs and carried as dependency roots to the owning integration; those roots participate in asset, integration, ownership, and renderer-specific lifecycle collection
- same-integration children stay renderer-local and do not need to pass through a universal transport

## Declared Foreign Child Contract

Static mixed-integration component configs must declare every possible foreign child in `config.dependencies.components`. Page dependency resolvers can additionally provide request-time component roots when a route loads a component dynamically.

`OwnershipValidationService` surfaces missing metadata or unknown integrations during `prepareRenderOptions()` and throws before render execution starts.

At runtime, renderers still discover actual foreign children through the active component render context.

The render context lives in `AsyncLocalStorage`, so overlapping renders each see their own. Component renders always execute under a render context that names the rendering integration (`executeComponentRender` installs one when none is active). This lets ownership guards such as the content-processor's `getComponent()` detect a foreign render lane even when no foreign-child runtime is installed.

### Prepared Graph Check

Preparation collects the assets of the components in the route's prepared graph. In development (`NODE_ENV=development`), a render fails when a component with `dependencies` and an identity file is rendered through the renderer's component entrypoint but is not in that graph, or sits under a parent without an identity file, where preparation collects no assets. The error names the component's file. Declare it by importing it statically from the module that declares it (a named re-export is followed, `export *` is not), listing it in the parent's `dependencies.components`, or returning it in `components` from a Page `dependencies` function. When the component is declared but reached only under a parent without an identity file, the error says so instead: give that parent an identity file by declaring it with `eco.component()` in its own module, or list the component from a parent that has one.

The Html shell, Layouts and Page are always graph roots, so the check catches Foreign Children. A Foreign Child is checked only when its parent's render installs a foreign-child runtime, which needs at least one declared Foreign Child descendant; an undeclared one under any other parent renders inline and is not seen. An integration that composes the Page and Layouts into one tree (React) sends only the Html shell and Foreign Children through that entrypoint. Same-integration children a renderer calls inline never pass through it either. Production renders and partial explicit views, which prepare no graph, are not checked. Renders add no assets, so a component missing from the graph renders in production without its stylesheets and scripts.

## Foreign Subtree Contract

`renderComponentWithForeignChildren()` is the renderer entrypoint for mixed-integration trees. It is responsible for:

- reusing the execution-scoped owning-renderer cache
- deciding whether the current component can stay local
- creating a foreign-child runtime when nested foreign ownership must be resolved
- normalizing unresolved artifact HTML before the render leaves the renderer

The owning renderer returns a `ComponentRenderResult` directly. Queue resolution applies its root attributes to its HTML and replaces the token with it; there is no intermediate payload or root-tag contract.

## Queue Model

Not every integration needs queue-based handoff.

- If a renderer can resolve a foreign child inline, it returns resolved output immediately.
- If it cannot, it may emit internal foreign-subtree tokens and resolve them before returning final HTML.
- Queue mechanics are module functions in `foreign-subtree-execution.service.ts`; they are renderer-owned transport inside one render pass, not a general route-level fallback mechanism.

## React Island Notes

- React islands are emitted without synthetic wrapper elements.
- The React integration attaches island host attributes (`data-eco-island`, `data-eco-component-id`, `data-eco-component-key`, `data-eco-props`) to the SSR root when a single root exists.
- Other integrations call `finalizeIslandComponentRender()` from core when a component instance ships its own client scripts, excluding those of Foreign Children. See `packages/core/src/islands/README.md`.
- The island bootstrap mounts with `createRoot()` into that SSR root.
- Hydration bootstraps listen for `eco:after-swap` so islands hydrate after client-side navigation.

## Current Limits

- Different integrations still own different foreign-child runtime strategies, which is intentional where child transport or hydration behavior differs.
- `integration-renderer.ts` remains the largest integration hook surface even after document-shell extraction.

## Discovered Dependencies and loading policy

Dependency collection reads declared `config.dependencies` plus identity-keyed inferred stylesheets, including deferred direct-import Component references. Traversal visits each config once; multiple Components in one file remain distinct. It collects explicit styles before inferred styles across the graph, suppressing inferred duplicates by resolved path. Page dependency results may include multiple file-owned contributions so relative assets keep the file that declared them. Source watch paths include discovered Components, their stylesheet files, and named barrel hops recorded during discovery. Preparing a route records those paths on the app-owned build-input index so the Project Watcher subscribes even when HTML is not stored. Rendered HTML cache dependencies include identity files and watch hops from the whole declared Component graph (not only Html, Layout, and Page roots), so editing a nested Component or retargeting a named barrel misses cached HTML. The route's Html, Layout, and Page roots still contribute their own identity files and local assets, which is how an HTML Page or `html.html` shell invalidates cached HTML.

Lit preloads scripts marked `ssr: true` before server rendering, while the existing lazy-trigger manifest controls browser loading. The route pipeline does not emit a second eager script for these entries. Integration renderers refresh their resolved global assets after runtime activation so late setup cannot omit hydration support.
