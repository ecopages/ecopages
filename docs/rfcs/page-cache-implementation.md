# Page Caching with ISR (Incremental Static Regeneration)

This PR introduces a complete page caching system with ISR support, enabling stale-while-revalidate semantics for optimal performance and freshness.

## Overview

The cache system allows pages to define their caching behavior through a simple `cache` property, supporting three strategies:

```typescript
// Static - cached indefinitely (default)
cache: 'static'

// Dynamic - never cached, fresh render on every request
cache: 'dynamic'

// ISR - cached with time-based revalidation and optional tags
cache: { revalidate: 60, tags: ['blog', 'posts'] }
```

## Architecture

### Core Components

- **`PageCacheService`** - Main service implementing stale-while-revalidate with background regeneration and promise deduplication
- **`MemoryCacheStore`** - LRU-based in-memory storage with tag indexing for efficient invalidation
- **`CacheStore` interface** - Pluggable storage backend (Redis, etc. can be implemented)
- **`CacheInvalidator` interface** - Narrow public API for programmatic invalidation in API handlers

### Request Flow

1. First request → render page → cache → return `X-Cache: MISS`
2. Subsequent requests (fresh) → serve from cache → `X-Cache: HIT`
3. After TTL expires → serve stale immediately → regenerate in background → `X-Cache: STALE`
4. Invalidation → remove from cache → next request triggers fresh render

## Features

- **Stale-While-Revalidate** - Visitors always get instant responses; regeneration happens in the background
- **Tag-Based Invalidation** - Invalidate all pages matching specific tags (e.g., all blog posts)
- **Path-Based Invalidation** - Invalidate specific URLs
- **LRU Eviction** - Automatic memory management with configurable `maxEntries`
- **Promise Deduplication** - Prevents thundering herd on concurrent stale requests
- **Cache Headers** - Automatic `Cache-Control` and `X-Cache` headers based on strategy

## Configuration

```typescript
// eco.config.ts
const config = await new ConfigBuilder()
	.setCache({
		enabled: true,
		defaultStrategy: 'static',
		maxEntries: 1000,
	})
	.build();
```

## API Handler Integration

```typescript
app.post('/api/revalidate', async ({ request, services }) => {
	const { tags, paths } = await request.json();

	await services.cache.invalidateByTags(tags);
	await services.cache.invalidateByPaths(paths);

	return Response.json({ revalidated: true });
});
```

## Page Usage

```typescript
export default eco.page({
	cache: {
		revalidate: 60,
		tags: ['blog', 'featured'],
	},
	render: () => html`<h1>My Blog Post</h1>`,
});
```

## Response Headers

| Strategy             | Cache-Control                                    | X-Cache        |
| -------------------- | ------------------------------------------------ | -------------- |
| `'static'`           | `public, max-age=31536000, immutable`            | HIT/MISS       |
| `'dynamic'`          | `no-store, must-revalidate`                      | MISS           |
| `{ revalidate: 60 }` | `public, max-age=60, stale-while-revalidate=120` | HIT/MISS/STALE |

## Testing

Comprehensive test coverage including:

- **30 unit tests** - Cache service and memory store behavior
- **15 E2E tests** - Full integration tests covering all cache scenarios:
    - Cache headers for all strategies
    - Static and dynamic caching behavior
    - Time-based revalidation with TTL expiry
    - Dynamic routes with independent cache keys
    - Tag and path-based invalidation
    - Cache statistics API

## Files Changed

### New Files

- `packages/core/src/services/cache/` - Cache service implementation
- `e2e/fixtures/cache-app/` - E2E test fixture
- `e2e/tests/cache/` - E2E test suite

### Modified

- `packages/core/src/adapters/bun/server-adapter.ts` - Cache integration
- `packages/core/src/adapters/shared/fs-server-response-matcher.ts` - Cache key generation
- `packages/core/src/router/fs-router.ts` - Fixed pathname for dynamic routes
- `packages/core/src/public-types.ts` - `CacheInvalidator` interface
