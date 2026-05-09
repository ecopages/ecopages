# Rendering Logic Graph

This document maps the rendering logic in core using the ownership, foreign-child, and foreign-subtree model.

## Design Principles

- Rendering entry points stay separate, but they converge on the same integration renderer contracts.
- Integration selection happens outside the renderer. Once selected, the integration renderer owns the render pipeline.
- Ownership is preparation-time metadata. Runtime handoff still happens inside renderer-owned foreign-child interception.
- Route-level fallback resolution is gone. Unresolved `<eco-marker>` artifacts are now a failure signal.
- Asset emission converges into one final HTML transformation step.

## 1) Runtime Request Flow

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
```

## 2) Route Render Flow

`IntegrationRenderer.execute()` delegates shared route orchestration to `RouteRenderFlow`.

```mermaid
flowchart TD
  A[IntegrationRenderer.execute] --> B[RouteRenderFlow.prepareRenderOptions]
  B --> C[resolvePageModule]
  C --> D[ownershipValidationService.validate]
  D --> E[resolvePageData]
  E --> F[ownershipPlanningService.buildPlan]
  F --> G[resolveDependencies]
  G --> H[buildPageBrowserGraph]
  H --> I{shouldRenderPageComponent?}
  I -- Yes --> J[renderPageComponent]
  I -- No --> K[skip page-root render]
  J --> L[merge component assets]
  K --> L
  L --> M[collect injector and eager SSR lazy assets]
  M --> N[build pagePackage and prepared render options]
  N --> O[callbacks.render]
  O --> P[capture rendered body as html]
  P --> Q[inspect unresolved marker artifacts]
  Q --> R{unresolved eco-marker remains?}
  R -- Yes --> S[throw unresolved artifact error]
  R -- No --> T[stamp root or document attributes when needed]
  T --> U[htmlTransformer transform]
  U --> V[final body and cache strategy]
```

## 3) Mixed-Integration Render Model

The renderer-level mental model is:

1. declared dependencies describe ownership
2. active render context intercepts foreign children
3. the owning renderer returns a foreign subtree

```mermaid
flowchart TD
  A[eco.component render] --> B[getComponentRenderContext]
  B --> C[foreignChildRuntime interceptForeignChildSync]
  C --> D{same integration?}
  D -- Yes --> E[render inline]
  D -- No --> F[delegate to owning renderer]
  F --> G[owning renderer renderComponentWithForeignChildren]
  G --> H[owning renderer renderForeignSubtree when payload form is needed]
  H --> I[resolved html plus assets and attachment policy]
```

## 4) Queued Foreign-Subtree Resolution

Some renderers cannot hand off foreign children inline. Those renderers can use the queue service during one render pass.

```mermaid
flowchart TD
  A[current renderer encounters foreign child] --> B{can resolve inline?}
  B -- Yes --> C[return resolved renderer-owned output]
  B -- No --> D[queue foreign-subtree token]
  D --> E[finish current render pass]
  E --> F[QueuedForeignSubtreeResolutionService resolveQueuedHtml]
  F --> G[resolve nested queued tokens first]
  G --> H[dispatch foreign subtree to owning renderer]
  H --> I[merge emitted assets and root attributes]
  I --> J[replace token in html]
```

## 5) Explicit Rendering Paths

These paths bypass most filesystem routing, but they still converge on the same renderer contracts.

```mermaid
flowchart TD
  A[ExplicitStaticRouteMatcher handleMatch] --> B[route loader returns view]
  B --> C[get renderer by integration]
  C --> D[renderer renderToResponse]

  E[render context render or renderPartial] --> F[get renderer from integrations list]
  F --> G[renderer renderToResponse]

  H[StaticSiteGenerator explicit routes] --> I[get renderer by integration]
  I --> J[renderer renderToResponse]
  J --> K[write html to dist]
```

## 6) Reading Order

The most useful reading order is:

1. `route-renderer.ts`
2. `orchestration/route-render-flow.ts`
3. `orchestration/integration-renderer.ts`
4. `orchestration/ownership-validation.service.ts`
5. `orchestration/ownership-planning.service.ts`
6. `orchestration/component-render-context.ts`
7. `orchestration/queued-foreign-subtree-resolution.service.ts`
8. `page-loading/page-module-loader.ts`
9. `page-loading/dependency-resolver.ts`
10. `eco/eco.ts`

## 7) Key Files

- `packages/core/src/route-renderer/route-renderer.ts`
- `packages/core/src/route-renderer/orchestration/route-render-flow.ts`
- `packages/core/src/route-renderer/orchestration/integration-renderer.ts`
- `packages/core/src/route-renderer/orchestration/ownership-validation.service.ts`
- `packages/core/src/route-renderer/orchestration/ownership-planning.service.ts`
- `packages/core/src/route-renderer/orchestration/component-render-context.ts`
- `packages/core/src/route-renderer/orchestration/queued-foreign-subtree-resolution.service.ts`
- `packages/core/src/route-renderer/page-loading/page-module-loader.ts`
- `packages/core/src/route-renderer/page-loading/dependency-resolver.ts`
- `packages/core/src/eco/eco.ts`
