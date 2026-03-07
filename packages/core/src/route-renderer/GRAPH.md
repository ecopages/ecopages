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
  A[FileSystemResponseMatcher handleMatch] --> B[importPageModule]
  B --> C[read Page cache and Page middleware]
  C --> D{Middleware exists?}

  D -- Yes --> E{cache dynamic?}
  E -- No --> F[throw LocalsAccessError]
  E -- Yes --> G[execute page middleware chain]
  G --> H[renderResponse]

  D -- No --> H[renderResponse]

  H --> I{cache disabled OR dynamic page?}
  I -- Yes --> J[renderFn directly]
  I -- No --> K[PageCacheService getOrCreate]

  J --> L[routeRenderer createRoute]
  K --> L
  L --> M[html and strategy]
  M --> N[createCachedResponse with cache headers]
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

### 4.1 Render preparation

```mermaid
flowchart TD
  A[prepareRenderOptions] --> B[resolvePageModule]
  B --> C[resolvePageData staticProps to metadata]
  C --> D[resolveDependencies and integration deps and route assets]
  D --> E{shouldRenderPageComponent?}
  E -- Yes --> F[renderComponent for page root]
  E -- No --> G[skip page root component render]
  F --> H[merge component assets]
  G --> H
  H --> I[collect lazy triggers]
  I --> J{triggers found?}
  J -- Yes --> K[append global injector runtime and scripts]
  J -- No --> L[continue]
  K --> L
  L --> M[htmlTransformer setProcessedDependencies]
  M --> N[return normalized render options]
```

### 4.2 Main execute flow

```mermaid
flowchart TD
  A[execute options] --> B[prepareRenderOptions]
  B --> C[runWithComponentRenderContext then render]
  C --> D[normalize response body to renderedHtml]
  D --> E[merge captured and explicit componentGraphContext]
  E --> F{contains eco marker token?}
  F -- Yes --> G[resolveMarkerGraphHtml]
  F -- No --> H[skip graph resolution]
  G --> I[merge marker assets into transformer deps]
  H --> J{root attributes attachable?}
  I --> J
  J -- Yes --> K[apply attributes to first body element]
  J -- No --> L[leave html unchanged]
  K --> M[htmlTransformer transform]
  L --> M
  M --> N[return body stream and cache strategy]
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
3. `route-renderer.ts`
4. `integration-renderer.ts`
5. `page-module-loader.ts`
6. `dependency-resolver.ts`
7. `component-marker.ts`
8. `component-graph.ts`
9. `component-graph-executor.ts`
10. `eco.ts`
11. `component-render-context.ts`
12. `html-transformer.service.ts`

## 9) Key Files

- `packages/core/src/adapters/shared/server-adapter.ts`
- `packages/core/src/adapters/shared/server-route-handler.ts`
- `packages/core/src/adapters/shared/fs-server-response-matcher.ts`
- `packages/core/src/adapters/shared/fs-server-response-factory.ts`
- `packages/core/src/adapters/shared/explicit-static-route-matcher.ts`
- `packages/core/src/adapters/shared/render-context.ts`
- `packages/core/src/route-renderer/route-renderer.ts`
- `packages/core/src/route-renderer/integration-renderer.ts`
- `packages/core/src/route-renderer/component-marker.ts`
- `packages/core/src/route-renderer/component-graph.ts`
- `packages/core/src/route-renderer/component-graph-executor.ts`
- `packages/core/src/route-renderer/page-module-loader.ts`
- `packages/core/src/route-renderer/dependency-resolver.ts`
- `packages/core/src/eco/component-render-context.ts`
- `packages/core/src/eco/eco.ts`
- `packages/core/src/services/html-transformer.service.ts`
- `packages/core/src/services/cache/page-cache-service.ts`
- `packages/core/src/integrations/ghtml/ghtml-renderer.ts`
