# Rendering Logic Graph

This document maps the end-to-end rendering logic in core, including request-time rendering, explicit route rendering, static generation, and marker graph orchestration.

## Design Principles

These diagrams are based on a few architectural assumptions that seem important to preserve:

- **Rendering entry points are separate, but should converge on shared renderer contracts.**
  Request-time page rendering, explicit view rendering, and static generation all eventually depend on the same integration renderer behavior.
- **Integration choice should remain a boundary concern.**
  Adapters and route matchers decide which renderer to use; once selected, the integration renderer owns the page render pipeline.
- **Data resolution should happen before HTML transformation.**
  Static props, metadata, dependency processing, and route assets are all upstream of final HTML injection.
- **Marker graph orchestration should be a post-render reconciliation step.**
  The initial integration render may emit deferred component markers; those are resolved after the first HTML pass, not during route matching.
- **Caching policy is authoritative at the page layer.**
  Middleware, locals, and response reuse all depend on the effective page cache strategy.
- **Asset emission should converge into one injection stage.**
  Route-level assets, integration assets, page-root component assets, and marker-generated assets all end up in the HTML transformer.

## Entry Points

There are three main rendering entry points:

1. **Runtime request rendering**
    - handled through the server adapters and file-system route matching
2. **Explicit rendering APIs**
    - handled through `renderToResponse()` and route-handler render context helpers
3. **Static site generation**
    - handled through explicit route generation and route renderer reuse at build time

## 1) Runtime Request Flow (Bun and Node)

```mermaid
flowchart TD
  A[HTTP request] --> B[SharedServerAdapter handleSharedRequest]
  B --> C{API route?}
  C -- Yes --> D[executeApiHandler]
  C -- No --> E[ServerRouteHandler handleResponse]

  E --> F{Explicit static route match?}
  F -- Yes --> G[ExplicitStaticRouteMatcher handleMatch]
  F -- No --> H{FS route match without file extension?}
  H -- Yes --> I[FileSystemResponseMatcher handleMatch]
  H -- No --> J[FileSystemResponseMatcher handleNoMatch]

  I --> K[RouteRendererFactory createRenderer]
  K --> L[RouteRenderer createRoute]
  L --> M[IntegrationRenderer execute]
  M --> N[response body and cache strategy]

  J --> O{Static asset request?}
  O -- Yes --> P[FileSystemServerResponseFactory createFileResponse]
  O -- No --> Q[FileSystemServerResponseFactory createCustomNotFoundResponse]
  Q --> R[routeRendererFactory createRenderer for 404 template]
  R --> S[RouteRenderer createRoute]
```

## 2) FS Route Rendering + Middleware + Cache

This is the most operationally important runtime path because it is where middleware, locals, and cache behavior are coordinated.

```mermaid
flowchart TD
  A[FileSystemResponseMatcher handleMatch] --> B[PageModuleImportService importModule]
  B --> C[read Page cache and Page middleware]
  C --> D[FileRouteMiddlewarePipeline assertValidConfiguration]
  D --> E{Middleware exists?}

  E -- Yes --> F{cache dynamic?}
  F -- No --> G[throw LocalsAccessError]
  F -- Yes --> H[FileRouteMiddlewarePipeline createContext]
  H --> I[FileRouteMiddlewarePipeline run]

  E -- No --> J[renderResponse]
  I --> J

  J --> K[PageRequestCacheCoordinator render]
  K --> L{cache disabled OR dynamic page?}
  L -- Yes --> M[renderFn directly]
  L -- No --> N[PageCacheService getOrCreate]

  M --> O[routeRenderer createRoute]
  N --> O
  O --> P[PageRequestCacheCoordinator bodyToString]
  P --> Q[html and strategy]
  Q --> R[createCachedResponse with cache headers]
```

## 3) RouteRendererFactory Selection Logic

This is a small but important boundary. It centralizes integration selection and renderer reuse, which helps keep adapter code thin.

```mermaid
flowchart TD
  A[createRenderer filePath] --> B[getRouteRendererEngine filePath]
  B --> C[getIntegrationPlugin by template extension]
  C --> D{renderer cached by integration name?}
  D -- Yes --> E[Reuse renderer]
  D -- No --> F[integrationPlugin.initializeRenderer]
  F --> G[Cache renderer]
  E --> H[RouteRenderer]
  G --> H

  I[getRendererByIntegration integrationName] --> J{plugin exists?}
  J -- No --> K[return null]
  J -- Yes --> L{renderer cached?}
  L -- Yes --> M[Reuse renderer]
  L -- No --> N[initializeRenderer + cache]
```

## 4) IntegrationRenderer Pipeline

The original single graph was accurate but a bit dense. Splitting it into preparation and execution phases makes the orchestration easier to reason about.

### 4.1 Render preparation via `RenderPreparationService`

```mermaid
flowchart TD
  A[IntegrationRenderer prepareRenderOptions] --> B[RenderPreparationService prepare]
  B --> C[resolvePageModule]
  C --> D[resolvePageData staticProps to metadata]
  D --> E[resolveDependencies and used integration deps and route assets]
  E --> F{shouldRenderPageComponent?}
  F -- Yes --> G[renderPageRoot via renderComponent]
  F -- No --> H[skip page root component render]
  G --> I[merge component assets]
  H --> I
  I --> J[collect lazy triggers]
  J --> K{triggers found?}
  K -- Yes --> L[buildGlobalInjectorAssets]
  K -- No --> M[continue]
  L --> M
  M --> N[HtmlPostProcessingService dedupeProcessedAssets]
  N --> O[htmlTransformer setProcessedDependencies]
  O --> P[return normalized render options]
```

### 4.2 Main execute flow via `RenderExecutionService`

```mermaid
flowchart TD
  A[IntegrationRenderer execute] --> B[RenderExecutionService execute]
  B --> C[prepareRenderOptions]
  C --> D[runWithComponentRenderContext then render]
  D --> E[normalize response body to renderedHtml]
  E --> F[merge captured and explicit componentGraphContext]
  F --> G{contains eco marker token?}
  G -- Yes --> H[resolveMarkerGraphHtml]
  G -- No --> I[skip graph resolution]
  H --> J[HtmlPostProcessingService dedupeProcessedAssets]
  J --> K[merge marker assets into transformer deps]
  I --> L{root attributes attachable?}
  K --> L
  L -- Yes --> M[HtmlPostProcessingService applyAttributesToFirstBodyElement]
  L -- No --> N[leave html unchanged]
  M --> O[htmlTransformer transform]
  N --> O
  O --> P[return body stream and cache strategy]
```

### 4.3 Render preparation responsibilities

```mermaid
flowchart LR
  A[Page module loader] --> B[static props]
  B --> C[metadata]
  C --> D[page props and locals]

  E[dependency resolver] --> F[component assets]
  F --> G[integration assets]
  G --> H[route assets]
  H --> I[global injector assets]

  D --> J[prepared render options]
  I --> J
```

### 4.4 Service boundary map

```mermaid
flowchart LR
  A[IntegrationRenderer] --> B[RenderPreparationService]
  A --> C[RenderExecutionService]
  A --> D[MarkerGraphResolver]
  A --> E[HtmlPostProcessingService]
  A --> F[PageModuleLoaderService]
  A --> G[DependencyResolverService]
  A --> H[HtmlTransformerService]

  B --> F
  B --> G
  B --> E
  C --> D
  C --> E
  C --> H
```

## 5) Marker Emission + Graph Resolution

This part is architecturally interesting because it introduces a second render stage. The first pass captures boundaries; the second pass resolves them in dependency order.

### 5.1 Marker emission in `eco.component` factory

```mermaid
flowchart TD
  A[eco component render] --> B[getComponentRenderContext]
  B --> C{cross integration to react?}
  C -- No --> D[render component content immediately]
  C -- Yes --> E[create nodeId + propsRef]
  E --> F[store props in propsByRef]
  F --> G{children include eco-marker tokens?}
  G -- Yes --> H[create slotRef and slotChildrenByRef links]
  G -- No --> I[no slot links]
  H --> J[createComponentMarker]
  I --> J
  J --> K[return eco marker token]
```

### 5.2 Marker graph execution

```mermaid
flowchart TD
  A[resolveMarkerGraphHtml] --> B[buildComponentRefRegistry]
  B --> C[extractComponentGraph from html and slot registry]
  C --> D[resolveComponentGraph in reverse levels]
  D --> E[for each marker node]
  E --> F[resolve component by componentRef]
  F --> G[resolve props by propsRef]
  G --> H[stitch child html from slotRef node ids]
  H --> I[getIntegrationRendererForName]
  I --> J[renderer.renderComponent]
  J --> K[collect component assets]
  K --> L[apply root attributes to first element]
  L --> M[replace marker token in HTML]
  M --> N[resolved html and assets]
```

## 6) Explicit Rendering Paths (outside FS page matching)

These paths are simpler than request-time file-system rendering because they bypass most router and cache orchestration.

```mermaid
flowchart TD
  A[ExplicitStaticRouteMatcher handleMatch] --> B[route loader returns view]
  B --> C[read view integration metadata]
  C --> D[routeRendererFactory getRendererByIntegration]
  D --> E[optional view.staticProps]
  E --> F[renderer renderToResponse]

  G[createRenderContext render or renderPartial] --> H[get renderer from integrations list]
  H --> I[merge props + locals]
  I --> J[renderer renderToResponse]

  K[StaticSiteGenerator explicit routes] --> L[getRendererByIntegration]
  L --> M[optional staticPaths and staticProps]
  M --> N[renderer renderToResponse]
  N --> O[write html to dist]
```

## 7) Current Concrete Integration in core

Today the concrete in-core renderer is `GhtmlRenderer`. That makes it a useful reference implementation for the abstract integration renderer contract.

```mermaid
flowchart TD
  A[GhtmlRenderer.render] --> B[Page params/query/props/locals]
  B --> C{Layout exists?}
  C -- Yes --> D[Layout wraps page content]
  C -- No --> E[use page content]
  D --> F[HtmlTemplate metadata + children + pageProps]
  E --> F
  F --> G[prepend DOCTYPE]

  H[GhtmlRenderer renderToResponse] --> I{partial?}
  I -- Yes --> J[return component html only]
  I -- No --> K[resolve Layout and HtmlTemplate and metadata]
  K --> L[prepend DOCTYPE]
  J --> M[createHtmlResponse]
  L --> M
```

## 8) Reading Order

For someone new to the rendering system, this is probably the most useful order to read the code:

1. `server-route-handler.ts`
2. `fs-server-response-matcher.ts`
3. `file-route-middleware-pipeline.ts`
4. `page-request-cache-coordinator.service.ts`
5. `route-renderer.ts`
6. `integration-renderer.ts`
7. `render-preparation.service.ts`
8. `render-execution.service.ts`
9. `marker-graph-resolver.ts`
10. `html-post-processing.service.ts`
11. `page-module-loader.ts`
12. `dependency-resolver.ts`
13. `component-marker.ts`
14. `component-graph.ts`
15. `component-graph-executor.ts`
16. `eco.ts`
17. `component-render-context.ts`
18. `html-transformer.service.ts`

## 9) Key Files

- `packages/core/src/adapters/shared/server-adapter.ts`
- `packages/core/src/adapters/shared/server-route-handler.ts`
- `packages/core/src/adapters/shared/fs-server-response-matcher.ts`
- `packages/core/src/adapters/shared/file-route-middleware-pipeline.ts`
- `packages/core/src/adapters/shared/fs-server-response-factory.ts`
- `packages/core/src/adapters/shared/explicit-static-route-matcher.ts`
- `packages/core/src/adapters/shared/render-context.ts`
- `packages/core/src/route-renderer/route-renderer.ts`
- `packages/core/src/route-renderer/integration-renderer.ts`
- `packages/core/src/route-renderer/render-preparation.service.ts`
- `packages/core/src/route-renderer/render-execution.service.ts`
- `packages/core/src/route-renderer/html-post-processing.service.ts`
- `packages/core/src/route-renderer/marker-graph-resolver.ts`
- `packages/core/src/route-renderer/component-marker.ts`
- `packages/core/src/route-renderer/component-graph.ts`
- `packages/core/src/route-renderer/component-graph-executor.ts`
- `packages/core/src/route-renderer/page-module-loader.ts`
- `packages/core/src/route-renderer/dependency-resolver.ts`
- `packages/core/src/services/page-module-import.service.ts`
- `packages/core/src/services/page-request-cache-coordinator.service.ts`
- `packages/core/src/eco/component-render-context.ts`
- `packages/core/src/eco/eco.ts`
- `packages/core/src/services/html-transformer.service.ts`
- `packages/core/src/services/cache/page-cache-service.ts`
- `packages/core/src/integrations/ghtml/ghtml-renderer.ts`
