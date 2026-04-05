# Router Layer

This directory contains route discovery, matching, and browser-side navigation infrastructure.

## Purpose

The router layer determines what route is being handled and how the client runtime coordinates navigation.

It is responsible for:

- filesystem route scanning and classification (`exact`, `dynamic`, `catch-all`)
- matching incoming request URLs to discovered routes
- server-side static-path expansion for dynamic routes
- client-side navigation ownership and cross-runtime handoff
- keeping route discovery separate from rendering execution

## Directory Structure

```
router/
├── server/                      # Server-side route scanning and matching
│   ├── fs-router-scanner.ts     # Scans the filesystem and classifies routes
│   └── fs-router.ts             # Matches request URLs to discovered routes
└── client/                      # Browser-side navigation coordination
    ├── navigation-coordinator.ts # Singleton runtime coordinator
    └── link-intent.ts           # Shared anchor detection and intent recovery helpers
```

## `server/`

### `FSRouterScanner`

Walks the pages directory and builds a `Routes` map keyed by route pathname.

File patterns determine route kind:

| Pattern | Kind | Example |
|---|---|---|
| `page.tsx` | `exact` | `/about` |
| `[slug].tsx` | `dynamic` | `/blog/[slug]` |
| `[...slug].tsx` | `catch-all` | `/docs/[...slug]` |

For `dynamic` routes, the scanner checks whether the page module exports `getStaticPaths`. If present, every returned path is expanded into a concrete `exact`-style route at scan time. In build mode, both `getStaticPaths` and `getStaticProps` are required or an invariant is thrown.

Catch-all routes are registered but skipped during static generation with a warning.

### `FSRouter`

Holds the scanned `Routes` map and exposes a `match(requestUrl)` method used by adapters.

Match priority:

1. `exact` — the pathname must equal the route pathname exactly.
2. `dynamic` — the clean (bracket-stripped) prefix must appear in the pathname, and the segment counts must match.
3. `catch-all` — the clean prefix must appear in the pathname.

Additional helpers:

- `getDynamicParams(route, pathname)` — extracts named and spread parameters from a matched dynamic or catch-all route.
- `getSearchParams(url)` — converts `URLSearchParams` to a plain object.
- `setOnReload(cb)` / `reload()` — re-scans routes and fires an optional callback, used during development HMR.

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
