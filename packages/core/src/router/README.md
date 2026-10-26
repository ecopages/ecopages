# Router Layer

**Layer:** Rendering.

This directory contains route discovery, matching, and browser-side navigation infrastructure.

## Purpose

The router layer determines what route is being handled and how the client runtime coordinates navigation.

It is responsible for:

- filesystem route discovery, with a role (`page`, `endpoint`) and a kind (`exact`, `dynamic`, `catch-all`) per route
- matching incoming request URLs to canonical template routes
- server-side static-path expansion for dynamic template routes
- client-side navigation ownership and cross-runtime handoff
- keeping route discovery separate from rendering execution

## Directory Structure

```
router/
├── server/                      # Server-side route discovery and matching
│   ├── route-registry.ts        # Owns template routes, request matching, static expansion, and reload
│   └── segment-path-matcher.ts  # Shared segment matching for every server route kind
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

Owns the canonical set of filesystem-discovered template routes for one application. Development scans the pages directory. Production `ecopages start` loads the list `ecopages build` wrote to `dist/.server/routes.json`.

File patterns determine route role and kind:

| Pattern            | Role       | Kind        | Example               |
| ------------------ | ---------- | ----------- | --------------------- |
| `about.tsx`        | `page`     | `exact`     | `/about`              |
| `[slug].tsx`       | `page`     | `dynamic`   | `/blog/[slug]`        |
| `[...slug].tsx`    | `page`     | `catch-all` | `/docs/[...slug]`     |
| `users.api.ts`     | `endpoint` | `exact`     | `/api/users`          |
| `[id].api.js`      | `endpoint` | `dynamic`   | `/api/users/[id]`     |
| `[...slug].api.ts` | `endpoint` | `catch-all` | `/api/docs/[...slug]` |

Route paths drop the longest registered extension the file ends with, so `about.kita.tsx` becomes `/about` and `v1.2.html` becomes `/v1.2`. Route kinds come from the path inside the pages directory, so brackets in the project path do not make routes dynamic.

A file ending in `.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx` (`ENDPOINT_FILE_EXTENSIONS` in `utils/endpoint-file-extensions.ts`, shared with config assembly) is an endpoint, discovered by the same scan with the whole marker dropped and `index` stripped like a Page: `api/users/index.api.ts` is `/api/users`, `newsletter/subscribe.api.js` is `/newsletter/subscribe`, and `api/` is not reserved. The marker is never a template extension (config assembly rejects an Integration that registers one), so `users.api.tsx` is `/users` and not the Page `/users.api` even when `.tsx` is registered. An endpoint has no Integration owner, Layout, Cache Strategy or `staticPaths`: its dynamic segments need no `acceptsParams`, and `listStaticPathExpansions()`, `listStaticGenerationRoutes()`, the sitemap and the browser-graph prebuild read `page` routes only. The server skips file routes for a URL that ends in a known static file extension (`hasKnownStaticExtension()`), so no endpoint file answers it: `files/[name].api.ts` does not answer `/files/report.csv`, and discovery rejects an endpoint file whose pathname ends in one (`feed.xml.api.ts`), naming the file and pointing to `app.ts`, whose Explicit Routes are matched first.

Discovery rejects two files that produce the same route, whatever the parameter names (for example `about.html` with `about.tsx` or `about/index.html`, `users.tsx` with `users.api.ts`, `users.api.ts` with `users.api.js`, or `blog/[slug].tsx` with `blog/[id].api.ts`); the error names both files, and both pathnames when they differ. `segmentPathPatternKey()` is the one definition of "same route". Discovery also rejects dynamic Page filenames such as `[slug].html` whose owning Integration sets `acceptsParams` to `false` (HTML Pages do, because they have no `staticPaths` source).

The registry stores canonical template routes only. `matchRequest()` parses each template route's pattern against the request pathname on every call; nothing is precompiled during `init()` or `reload()`. The registry does not execute `staticPaths()` during discovery.

Build-time static expansion is a separate operation. The registry invokes `staticPaths()` lazily through an injected page-module adapter and returns concrete static path expansions for the static generator.

The public interface is intentionally small:

- `templateRoutes` — ordered readonly template routes, each with its `role` and `kind`
- `init()` / `reload()` — rebuild the template route list
- `matchRequest(requestUrl)` — request-time matching result with requested pathname, matched template route, params, and query; endpoint routes match in the same order as Pages, so `api/[id].api.ts` wins `/api/5` over a `[...slug].tsx` Page; the server answers a matched endpoint through the API pipeline (`adapters/README.md`, Shared Request Contracts)
- `listStaticPathExpansions()` — build-time expansion for dynamic `page` routes; a Page with `cache: 'dynamic'` renders per request, so it is skipped and needs no `staticPaths`
- `listStaticGenerationRoutes()` — build-time route planning for static generation across exact and expanded `page` routes

Match priority:

1. `exact` — the normalized, decoded pathname segments must equal the route segments.
2. `dynamic` — the route and pathname must have the same number of segments; literal segments must match exactly, and each parameter segment matches one segment.
3. `catch-all` — the prefix segments must match the pathname.

When several dynamic routes, or several catch-all routes, match one request, their segments (a catch-all's prefix) are compared from left to right, so an earlier literal segment wins over a parameter: `/api/[id]` answers `/api/5` before `/[section]/[slug]`. When those patterns tie, the catch-all with the longer prefix wins, then pathname order provides a deterministic tie-breaker.

The shared segment matcher uses `normalizePathname`, which adds a leading slash and removes trailing slashes except for `/`. It preserves repeated slashes inside a pathname; matching ignores the empty segments between them. The matcher splits paths on `/` before decoding each segment once, so an encoded slash stays inside its original segment. Malformed percent escapes raise an HTTP 400 error (subject to `app.onError` handling), even when no registered route matches.

Supported dynamic route syntax and captured values:

| Route kind | Named parameters    | Catch-all or wildcard     | Handler-facing value                                                                                   |
| ---------- | ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Filesystem | `[name]`            | `[...name]`               | Named parameter is a string; catch-all is a string array.                                              |
| API        | `:name` or `[name]` | `[...name]` or `*`        | Named parameters are strings; catch-all params are arrays of decoded segments. `*` has no named value. |
| Explicit   | `:name` or `[name]` | `:...name` or `[...name]` | Named parameters and catch-alls are strings; catch-all segments are joined with `/`.                   |
| WebSocket  | `:name`             | None                      | Named parameters are strings.                                                                          |

The same segment grammar builds concrete pathnames: `staticPaths()` params for filesystem routes and for explicit static routes fill `:name`, `[name]`, `:...name` and `[...name]` segments one segment at a time, so a param named `id` never rewrites `:idx`, and a catch-all array expands to one segment per value. Static export and the registry share this one builder.

Repeated query keys retain all values in order: `?tag=docs&tag=api` becomes `{ tag: ['docs', 'api'] }`. A query key with one value remains a string. Pages, API handlers, WebSocket upgrade handlers (`search`), route matching, and static route info share `PageParams` and `PageQuery` value shapes, parsed by one function. A schema that expects a plain string answers HTTP 400 for a repeated key.

API and WebSocket matching still prioritize more specific routes. Filesystem routes follow the match priority above; explicit routes keep declaration order.

## `client/`

### View transitions (`@ecopages/core/client`)

Shared helpers used by `@ecopages/browser-router` and `@ecopages/react-router`:

- `applyViewTransitionNames` / `clearViewTransitionNames` — named `data-view-transition` morph / fade styles (`eco-vt-dynamic-styles`).
- `ensureRootViewTransitionStyles` — persisted CSS (`eco-vt-root-styles`, `data-eco-persist`) with `html { view-transition-name: none }` when VT is enabled.
- `navigationHasNamedViewTransitions` — detects named `data-view-transition` markup on either page.

Each later navigation supersedes cleanup from earlier transitions, including when it skips animation. A failed or uncommitted page swap clears transition names.

### Client navigation pipeline (`@ecopages/core/client`)

`commitNavigationPage()` owns shared document work: it dispatches lifecycle hooks, waits for new stylesheets, reconciles the head, wraps the adapter's swap in a named view transition, activates scripts, and invokes the router's scroll callback after the swap. Browser-router always morphs the incoming body. Persisted nodes remain attached when the incoming page keeps their ancestor structure compatible, whether view transitions are enabled or the page has rerun scripts. With rerun scripts, matching non-persisted elements refresh before activation except for the body, persisted elements, their ancestor path, and descendants of custom elements on that path; those descendants stay in place so the connected host's handlers remain active. Handler-bound child markup must remain structurally compatible, or the custom element must rebind when its child markup changes, because replacing a child does not reconnect the host. Handlers installed on any retained nodes must be registered idempotently. React-router supplies a React render and its scroll callback. Both use the same fetch, parse, cache, script identity, persist attribute, and queued-click policy. Link interception resolves each anchor's href the way a full page load would, against the current URL and any `<base href>`, so `?page=2`, `next` and `../x` stay relative to the page. Head reconciliation removes head elements the incoming page lacks unless they carry the persist attribute. Browser-router prefetches into the shared HTML cache and reads it on click; React-router always fetches fresh HTML and only writes to the cache. A later commit that removes a staged stylesheet also settles its load wait so the superseded navigation can finish promptly. Rerun scripts match by `data-eco-script-id`, HTML `id`, original `src`, or inline contents. When matching by relative `src`, identity stays stable across different page base URLs, while external modules execute from the incoming page's resolved URL. The `runNavigationViewTransition()` update callback may return `false` when it does not commit; a void result counts as committed.

The named exports from this entry are supported APIs for browser runtime authors. They cover document loading and cache control (`fetchNavigationPage`, `parseNavigationDocument`, `cacheNavigationHtml`, `getCachedNavigationHtml`, `invalidateNavigationHtml`, and `clearNavigationHtmlCache`), prefetch and replay policy (`shouldPrefetchLink`, `isSamePageHref`, and `decideQueuedNavigationReplay`), staged document updates (`prepareNavigationHead`, `activatePreparedNavigationScripts`, and `commitNavigationPage`), script activation (`activateNavigationScripts`, `activateScriptsInOrder`, and `collectBodyScripts`), named view transitions (`runNavigationViewTransition`), and the shared persist attribute (`ECO_PERSIST_ATTRIBUTE`). Their associated option and result types are exported alongside them.

### Navigation Coordinator (`navigation-coordinator.ts`)

A singleton browser-side runtime stored on `window.__ECO_PAGES__.navigation`.

Access it with:

```ts
import { getEcoNavigationRuntime } from '@ecopages/core/client';
const runtime = getEcoNavigationRuntime();
```

The coordinator is framework-agnostic. Browser runtimes (e.g. `browser-router`, `react-router`) register themselves and the coordinator arbitrates:

- **Ownership** — which runtime currently drives SPA navigation (`claimOwnership`, `releaseOwnership`).
- **Document owner marker** — an HTML attribute (`data-eco-document-owner`) written into rendered markup so the coordinator can `adoptDocumentOwner` on the incoming page.
- **Navigation transactions** — each navigation begins a transaction with an `AbortSignal`; superseded navigations are automatically cancelled.
- **Cross-runtime handoff** — `requestHandoff` passes a pre-fetched `Document` to the target runtime without tearing down the current page prematurely.
- **Reload** — `reloadCurrentPage` delegates to whichever runtime currently owns the document.

### Navigation Lifecycle (`navigation-lifecycle.ts`)

Shared document lifecycle events emitted by browser runtimes after a client navigation commits.

Access it with:

```ts
import { ECO_NAVIGATION_LIFECYCLE_EVENTS, type EcoNavigationEvent } from '@ecopages/core/client';
```

The shared navigation pipeline emits these events around the router-specific swap. A custom runtime commits the new document with `commitNavigationPage` (also from `@ecopages/core/client`) and does not dispatch the events itself. Listeners use the DOM contract:

- `eco:before-swap` — pre-commit hook with `newDocument` and `reload()`
- `eco:after-swap` — post-commit signal after the runtime has applied the new page
- `eco:page-load` — scheduled on the next animation frame after `eco:after-swap`

Scripts listening to client navigation events (`eco:after-swap`, `eco:page-load`) should be registered as client scripts (e.g., using `scripts: ['./component.script.ts']`) or guarded by `isServer` from `@ecopages/radiant/is-server` when used in Radiant projects where `document` is defined during SSR.

### Link Intent (`link-intent.ts`)

Shared helpers for locating anchors and recovering stale navigation intent.

- `getAnchorFromNavigationEvent(event, linkSelector)` — finds the nearest matching anchor in the event's composed path, including across Shadow DOM boundaries.
- `recoverPendingNavigationHref(intent, hasInFlightNavigation, now, maxAgeMs?)` — resolves a previously captured pointer or hover target when the DOM changes before the click lands. Intents expire after `maxAgeMs` (default 1000 ms).

## Relationship To Rendering

The router layer answers **which route should run**.
The route-renderer layer answers **how that route gets rendered**.

Keeping those seams separate avoids mixing route ownership, module loading, and component orchestration into one service.
