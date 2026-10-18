# Page Cache

**Layer:** Rendering.

The page cache stores rendered HTML for request-time Pages. `PageCacheService` implements the configured cache strategy, including stale-while-revalidate and path, tag, and source-file invalidation. `PageRequestCacheCoordinator` applies that policy to one HTTP render and creates the response headers.

Each cached entry binds the route modules, browser graph, processed assets, and render-shell inputs it used. Development invalidates entries that depend on changed files. An edit under `additionalWatchPaths` clears the HTML cache because the Pages that read those files are not known. Path invalidation also removes query and development runtime variants and releases the entry's build-input bindings.

The `static` strategy reuses HTML until invalidation or the next deploy and sends `must-revalidate` with an ETag. The `immutable` Cache-Control directive applies only to content-hashed asset URLs, never to HTML responses. Page caching is off in watch mode unless `cache.enabled: true` opts in.

## Files

- `page-cache-service.ts`: cache reads, writes, regeneration, and invalidation.
- `page-request-cache-coordinator.service.ts`: request-time cache policy, body normalization, and response headers.
- `html-page-cache-dependency-index.ts`: binds rendered HTML entries to the source files they read.
- `memory-cache-store.ts`: default in-memory cache store.
- `cache.types.ts`: cache strategies, entries, and store contracts.
