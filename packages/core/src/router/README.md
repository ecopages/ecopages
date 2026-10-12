# Router Layer

This directory contains route discovery, matching, and browser-side navigation infrastructure.

## Purpose

The router layer determines what route is being handled and how the client runtime coordinates navigation.

It is responsible for:

- filesystem route discovery and classification (`exact`, `dynamic`, `catch-all`)
- matching incoming request URLs to canonical template routes
- server-side static-path expansion for dynamic template routes
- client-side navigation ownership and cross-runtime handoff
- keeping route discovery separate from rendering execution

## Directory Structure

```
router/
├── server/                      # Server-side route discovery and matching
│   └── route-registry.ts        # Owns template routes, request matching, static expansion, and reload
└── client/                      # Browser-side navigation coordination
    ├── navigation-coordinator.ts # Singleton runtime coordinator
    ├── navigation-commit.ts      # Shared client navigation commit pipeline
    ├── navigation-document.ts    # Shared page fetch, HTML cache, and base-aware parsing
    ├── navigation-head.ts        # Shared page head reconciliation
    ├── navigation-lifecycle.ts   # Shared document lifecycle events
    ├── navigation-pipeline.ts    # Public client navigation entry
    ├── navigation-replay.ts      # Shared queued-navigation decision
    ├── navigation-view-transition.ts # Shared named-transition wrapper
    └── link-intent.ts           # Shared anchor detection and intent recovery helpers
```

## `server/`

### `RouteRegistry`

Owns the canonical set of filesystem-discovered template routes for one application.

File patterns determine route kind:

| Pattern         | Kind        | Example           |
| --------------- | ----------- | ----------------- |
| `page.tsx`      | `exact`     | `/about`          |
| `[slug].tsx`    | `dynamic`   | `/blog/[slug]`    |
| `[...slug].tsx` | `catch-all` | `/docs/[...slug]` |

Route paths drop the longest registered extension the file ends with, so `about.kita.tsx` becomes `/about` and `v1.2.html` becomes `/v1.2`. Route kinds come from the path inside the pages directory, so brackets in the project path do not make routes dynamic.

Discovery rejects two Page files that produce the same template route (for example `about.html` with `about.tsx` or `about/index.html`) and dynamic filenames such as `[slug].html` whose owning Integration sets `acceptsParams` to `false` (HTML Pages do, because they have no `staticPaths` source).

The registry stores canonical template routes only. It compiles request-time matching metadata during `init()` and `reload()`, but it does not execute `staticPaths()` during discovery.

Build-time static expansion is a separate operation. The registry invokes `staticPaths()` lazily through an injected page-module adapter and returns concrete static path expansions for the static generator.

The public interface is intentionally small:

- `templateRoutes` — ordered readonly template routes
- `init()` / `reload()` — rebuild discovery state and match metadata
- `matchRequest(requestUrl)` — request-time matching result with requested pathname, matched template route, params, and query
- `listStaticPathExpansions()` — build-time expansion for dynamic routes
- `listStaticGenerationRoutes()` — build-time route planning for static generation across exact and expanded routes

Match priority:

1. `exact` — the pathname must equal the route pathname exactly.
2. `dynamic` — the clean (bracket-stripped) prefix must appear in the pathname, and the segment counts must match.
3. `catch-all` — the prefix segments must match the pathname. When multiple
   catch-all routes match, shared prefix segments are compared from left to right
   so an earlier static segment wins over a dynamic one; when those patterns tie,
   the route with the longer prefix wins, then pathname order provides a
   deterministic tie-breaker.

## `client/`

### View transitions (`@ecopages/core/client/view-transitions`)

Shared helpers used by `@ecopages/browser-router` and `@ecopages/react-router`:

- `applyViewTransitionNames` / `clearViewTransitionNames` — named `data-view-transition` morph / fade styles (`eco-vt-dynamic-styles`).
- `ensureRootViewTransitionStyles` — persisted CSS (`eco-vt-root-styles`, `data-eco-persist`) with `html { view-transition-name: none }` when VT is enabled.
- `navigationHasNamedViewTransitions` — detects named `data-view-transition` markup on either page.

### Client navigation pipeline (`@ecopages/core/router/navigation-pipeline`)

`commitNavigationPage()` owns shared document work: it dispatches lifecycle hooks, waits for new stylesheets, reconciles the head, wraps the adapter's swap in a named view transition, activates scripts, and invokes the router's scroll callback after the swap. Browser-router supplies a body morph or replacement; React-router supplies a React render and its scroll callback. Both use the same fetch, parse, cache, script identity, persist attribute, and queued-click policy. Head reconciliation removes head elements the incoming page lacks unless they carry the persist attribute. Browser-router prefetches into the shared HTML cache and reads it on click; React-router always fetches fresh HTML and only writes to the cache. A later commit that removes a staged stylesheet also settles its load wait so the superseded navigation can finish promptly. Rerun scripts match by `data-eco-script-id`, HTML `id`, original `src`, or inline contents. When matching by relative `src`, identity stays stable across different page base URLs, while external modules execute from the incoming page's resolved URL.

The named exports from this entry are supported APIs for browser runtime authors. They cover document loading and cache control (`fetchNavigationPage`, `parseNavigationDocument`, `cacheNavigationHtml`, `getCachedNavigationHtml`, `invalidateNavigationHtml`, and `clearNavigationHtmlCache`), prefetch and replay policy (`shouldPrefetchLink`, `isSamePageHref`, and `decideQueuedNavigationReplay`), staged document updates (`prepareNavigationHead`, `activatePreparedNavigationScripts`, and `commitNavigationPage`), script activation (`activateNavigationScripts`, `activateScriptsInOrder`, and `collectBodyScripts`), named view transitions (`runNavigationViewTransition`), and the shared persist attribute (`ECO_PERSIST_ATTRIBUTE`). Their associated option and result types are exported alongside them.

### Navigation Coordinator (`navigation-coordinator.ts`)

A singleton browser-side runtime stored on `window.__ECO_PAGES__.navigation`.

Access it with:

```ts
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
const runtime = getEcoNavigationRuntime();
```

The coordinator is framework-agnostic. Browser runtimes (e.g. `browser-router`, `react-router`) register themselves and the coordinator arbitrates:

- **Ownership** — which runtime currently drives SPA navigation (`claimOwnership`, `releaseOwnership`, `setOwner`).
- **Document owner marker** — an HTML attribute (`data-eco-document-owner`) written into rendered markup so the coordinator can `adoptDocumentOwner` on the incoming page.
- **Navigation transactions** — each navigation begins a transaction with an `AbortSignal`; superseded navigations are automatically cancelled.
- **Cross-runtime handoff** — `requestHandoff` passes a pre-fetched `Document` to the target runtime without tearing down the current page prematurely.
- **Reload** — `reloadCurrentPage` delegates to whichever runtime currently owns the document.
- **Events** — `subscribe` lets runtimes react to `owner-change` and `registration-change` events.

### Navigation Lifecycle (`navigation-lifecycle.ts`)

Shared document lifecycle events emitted by browser runtimes after a client navigation commits.

Access it with:

```ts
import {
	completeNavigationLifecycle,
	dispatchBeforeSwap,
	type EcoNavigationEvent,
} from '@ecopages/core/router/navigation-lifecycle';
```

The shared navigation pipeline emits these events around the router-specific swap. Use `completeNavigationLifecycle` when implementing a custom runtime. Listeners use the DOM contract:

- `eco:before-swap` — pre-commit hook with `newDocument` and `reload()`
- `eco:after-swap` — post-commit signal after the runtime has applied the new page
- `eco:page-load` — scheduled on the next animation frame after `eco:after-swap`

This is separate from coordinator `subscribe()` events, which track runtime ownership rather than page lifecycle.

Scripts listening to client navigation events (`eco:after-swap`, `eco:page-load`) should be registered as client scripts (e.g., using `scripts: ['./component.script.ts']`) or guarded by `isServer` from `@ecopages/radiant/is-server` when used in Radiant projects where `document` is defined during SSR.

### Link Intent (`link-intent.ts`)

Shared helpers for locating anchors and recovering stale navigation intent.

- `getAnchorFromNavigationEvent(event, linkSelector)` — finds the nearest matching anchor in the event's composed path, including across Shadow DOM boundaries.
- `recoverPendingNavigationHref(intent, hasInFlightNavigation, now, maxAgeMs?)` — resolves a previously captured pointer or hover target when the DOM changes before the click lands. Intents expire after `maxAgeMs` (default 1000 ms).

## Relationship To Rendering

The router layer answers **which route should run**.
The route-renderer layer answers **how that route gets rendered**.

Keeping those seams separate avoids mixing route ownership, module loading, and component orchestration into one service.
