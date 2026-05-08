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
3. `catch-all` — the clean prefix must appear in the pathname.

## `client/`

### Navigation Coordinator (`navigation-coordinator.ts`)

A singleton browser-side runtime stored on `window.__ECO_PAGES__.navigation`.

Access it with:

```ts
import { getEcoNavigationRuntime } from '@ecopages/core/router/client/navigation-coordinator';
const runtime = getEcoNavigationRuntime();
```

The coordinator is framework-agnostic. Browser runtimes (e.g. `browser-router`, `react-router`) register themselves and the coordinator arbitrates:

- **Ownership** — which runtime currently drives SPA navigation (`claimOwnership`, `releaseOwnership`, `setOwner`).
- **Document owner marker** — an HTML attribute (`data-eco-document-owner`) written into rendered markup so the coordinator can `adoptDocumentOwner` on the incoming page.
- **Navigation transactions** — each navigation begins a transaction with an `AbortSignal`; superseded navigations are automatically cancelled.
- **Cross-runtime handoff** — `requestHandoff` passes a pre-fetched `Document` to the target runtime without tearing down the current page prematurely.
- **Reload** — `reloadCurrentPage` delegates to whichever runtime currently owns the document.
- **Events** — `subscribe` lets runtimes react to `owner-change` and `registration-change` events.

### Link Intent (`link-intent.ts`)

Shared helpers for locating anchors and recovering stale navigation intent.

- `getAnchorFromNavigationEvent(event, linkSelector)` — finds the nearest matching anchor in the event's composed path, including across Shadow DOM boundaries.
- `recoverPendingNavigationHref(intent, hasInFlightNavigation, now, maxAgeMs?)` — resolves a previously captured pointer or hover target when the DOM changes before the click lands. Intents expire after `maxAgeMs` (default 1000 ms).

## Relationship To Rendering

The router layer answers **which route should run**.
The route-renderer layer answers **how that route gets rendered**.

Keeping those seams separate avoids mixing route ownership, module loading, and component orchestration into one service.
