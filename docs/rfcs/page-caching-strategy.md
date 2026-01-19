# RFC: Page Caching & Rendering Strategy

> **Status**: Draft  
> **Created**: 2026-01-18  
> **Last Updated**: 2026-01-18  
> **Author**: @andeeplus

---

## Table of Contents

1. [Summary](#summary)
2. [Motivation](#motivation)
3. [Goals & Non-Goals](#goals--non-goals)
4. [Current Architecture](#current-architecture)
5. [Proposed Design](#proposed-design)
6. [API Reference](#api-reference)
7. [Implementation Plan](#implementation-plan)
8. [Open Questions](#open-questions)
9. [Decision Log](#decision-log)
10. [References](#references)

---

## Summary

This RFC proposes a page-level caching and rendering strategy configuration for EcoPages. The goal is to allow pages to declare their caching intent, enabling static pages to be served efficiently without re-rendering on every request.

---

## Motivation

### Problem

Currently, EcoPages operates in two modes:

1. **Static Site Generation (SSG)** - Pages are pre-rendered at build time
2. **Server Mode** - Pages are re-rendered on every request

There's no middle ground. Pages that are effectively static (no dynamic params, rarely changing data) are still re-rendered on every request in server mode, which:

- Increases Time To First Byte (TTFB)
- Wastes server resources
- Provides no cache control to browsers/CDNs

### User Stories

1. As a developer, I want my "About" page to be cached indefinitely until I redeploy
2. As a developer, I want my blog index to refresh every hour without a full rebuild
3. As a developer, I want to invalidate my product pages when inventory changes via webhook
4. As a developer, I want proper Cache-Control headers for CDN integration

---

## Goals & Non-Goals

### Goals

- [ ] Page-level cache configuration via `eco.page()`
- [ ] Support for static, dynamic, and time-based revalidation strategies
- [ ] Proper HTTP Cache-Control header generation
- [ ] In-memory caching for server mode
- [ ] On-demand cache invalidation via tags
- [ ] Zero breaking changes (opt-in feature)
- [ ] Works in dev, production server, and SSG modes

### Non-Goals (for now)

- ~~Distributed cache (Redis, Memcached)~~ → Now in scope via pluggable stores
- Edge caching integration - CDN handles this via headers
- Per-request cache variations (cookies, headers) - complex, defer
- Partial page caching / fragment caching - different problem space

---

## Incremental Static Regeneration (ISR) Deep Dive

### What is ISR?

ISR is a hybrid rendering strategy that combines the benefits of static generation with the flexibility of server-side rendering. Originally introduced by Next.js, it allows:

1. **Pre-render at build time** - Like traditional SSG
2. **Serve stale content instantly** - No waiting for re-render
3. **Regenerate in background** - Update content without rebuild
4. **Time-based or on-demand** - Flexible invalidation

### ISR Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ISR Request Flow                            │
└─────────────────────────────────────────────────────────────────────┘

Request arrives
      │
      ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐
│ Cache Check │────►│ Cache Hit?  │─Yes─►│ Is content stale?       │
└─────────────┘     └─────────────┘      └─────────────────────────┘
                          │                      │           │
                          No                    Yes          No
                          │                      │           │
                          ▼                      ▼           ▼
                    ┌───────────┐         ┌───────────┐  ┌───────────┐
                    │  Render   │         │Return old │  │Return from│
                    │   Page    │         │+ bg regen │  │  cache    │
                    └───────────┘         └───────────┘  └───────────┘
                          │                      │
                          ▼                      ▼
                    ┌───────────┐         ┌───────────┐
                    │Store cache│         │Background │
                    │ + return  │         │ re-render │
                    └───────────┘         └───────────┘
```

### ISR vs Other Strategies

| Aspect         | SSG                 | SSR          | ISR                        |
| -------------- | ------------------- | ------------ | -------------------------- |
| Build time     | Renders all pages   | None         | Renders all pages          |
| Request time   | Serve static file   | Full render  | Serve cached + maybe regen |
| Data freshness | Stale until rebuild | Always fresh | Configurable staleness     |
| TTFB           | Fastest             | Slowest      | Fast (cached)              |
| Server load    | None                | High         | Low (amortized)            |
| Rebuild needed | For any change      | Never        | Only for code changes      |

### ISR Modes in EcoPages

#### 1. Time-Based Revalidation

```typescript
export default eco.page({
	cache: { revalidate: 3600 }, // Revalidate after 1 hour

	staticProps: async () => {
		const posts = await fetchBlogPosts();
		return { props: { posts } };
	},
	render: ({ posts }) => html`...`,
});
```

**How it works:**

- First request: render and cache
- Subsequent requests within 1 hour: serve from cache
- Request after 1 hour: serve stale, trigger background re-render
- Next request: serve fresh content

#### 2. On-Demand Revalidation

```typescript
export default eco.page({
	cache: {
		revalidate: 86400, // 24 hours max
		tags: ['products', 'inventory'],
	},
	staticProps: async () => {
		const products = await fetchProducts();
		return { props: { products } };
	},
	render: ({ products }) => html`...`,
});

// Webhook handler (e.g., from CMS or inventory system)
app.post('/api/webhooks/inventory', async ({ request }) => {
	await revalidateTag('inventory');
	return Response.json({ revalidated: true });
});
```

**How it works:**

- Content cached for up to 24 hours
- Webhook triggers immediate invalidation of all pages tagged 'inventory'
- Next request triggers fresh render

#### 3. Hybrid: Time + On-Demand

Best of both worlds - regular refresh interval with ability to force update.

### ISR Implementation Considerations

#### Cache Key Strategy

```typescript
// Simple: URL path only
const cacheKey = '/blog/my-post';

// With params: URL + serialized params
const cacheKey = '/products/[id]::{"id":"123"}';

// With query: URL + params + query (opt-in)
const cacheKey = '/search::{}::{"q":"shoes","page":"2"}';
```

#### Stale-While-Revalidate Semantics

```typescript
interface CacheEntry {
	html: string;
	createdAt: number; // When cached
	revalidateAfter: number; // When considered stale
	expiresAt: number; // When too stale to serve (optional hard limit)
	tags: string[];
	etag: string; // For conditional requests
}

function isStale(entry: CacheEntry): boolean {
	return Date.now() > entry.revalidateAfter;
}

function isExpired(entry: CacheEntry): boolean {
	return entry.expiresAt && Date.now() > entry.expiresAt;
}
```

#### Background Regeneration

```typescript
async function getOrCreate(key: string, strategy: CacheStrategy, render: () => Promise<string>) {
	const entry = cache.get(key);

	// Cache miss - render synchronously
	if (!entry) {
		const html = await render();
		cache.set(key, html, strategy);
		return { html, status: 'miss' };
	}

	// Fresh cache - return immediately
	if (!isStale(entry)) {
		return { html: entry.html, status: 'hit' };
	}

	// Stale but servable - return stale, regen in background
	if (!isExpired(entry)) {
		// Fire and forget - don't await
		regenerateInBackground(key, render, strategy);
		return { html: entry.html, status: 'stale' };
	}

	// Too stale - must wait for fresh render
	const html = await render();
	cache.set(key, html, strategy);
	return { html, status: 'expired' };
}

function regenerateInBackground(key: string, render: () => Promise<string>, strategy: CacheStrategy) {
	// Use queueMicrotask or setImmediate to not block response
	queueMicrotask(async () => {
		try {
			const html = await render();
			cache.set(key, html, strategy);
			appLogger.debug(`[ISR] Regenerated: ${key}`);
		} catch (error) {
			appLogger.error(`[ISR] Failed to regenerate: ${key}`, error);
			// Keep stale content on failure
		}
	});
}
```

### ISR Edge Cases

1. **Concurrent requests during regeneration**
    - Solution: Lock mechanism or "first wins" - only one regeneration at a time

2. **Long-running staticProps**
    - Solution: Timeout + keep serving stale

3. **staticProps throws error**
    - Solution: Keep stale content, log error, retry on next stale request

4. **Memory pressure**
    - Solution: LRU eviction (covered in cache store section)

---

## Current Architecture

### Request Flow (Server Mode)

```
Request
  │
  ▼
BunServerAdapter.handleRequest()
  │
  ▼
ServerRouteHandler.handleResponse()
  │
  ▼
FileSystemResponseMatcher.handleMatch()
  │
  ▼
RouteRendererFactory.createRenderer()
  │
  ▼
IntegrationRenderer.execute()
  │
  ├─► prepareRenderOptions()  (imports page, resolves deps)
  │
  └─► render()  (integration-specific rendering)
  │
  ▼
Response (always fresh, no caching)
```

### Key Files

| File                            | Responsibility                     |
| ------------------------------- | ---------------------------------- |
| `eco.ts` / `eco.types.ts`       | Page factory API                   |
| `integration-renderer.ts`       | Base rendering logic               |
| `fs-server-response-matcher.ts` | Route matching & response creation |
| `fs-server-response-factory.ts` | Response building                  |
| `server-route-handler.ts`       | Request handling                   |

---

## Proposed Design

### Option A: Full Cache Strategy (Recommended)

Page-level `cache` configuration with in-memory caching and revalidation.

```typescript
export default eco.page({
  cache: 'static' | 'dynamic' | { revalidate: number; tags?: string[] },

  staticProps: async () => { /* ... */ },
  render: ({ data }) => html`...`,
});
```

**Pros:**

- Full control over caching behavior
- ISR-like functionality
- On-demand invalidation

**Cons:**

- More complex implementation
- Memory usage for cache storage

### Option B: Headers-Only Approach

Simple `headers` configuration that delegates caching to CDN/browser.

```typescript
export default eco.page({
	headers: {
		'Cache-Control': 'public, max-age=3600',
	},
	render: () => html`...`,
});
```

**Pros:**

- Simple implementation
- Leverages existing infrastructure (CDN)

**Cons:**

- No server-side caching
- No on-demand invalidation
- Re-renders on every cache miss

### Option C: Hybrid Approach

Combine both - server-side cache with configurable response headers.

```typescript
export default eco.page({
	cache: {
		strategy: 'static',
		headers: {
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	},
	render: () => html`...`,
});
```

---

## API Reference

### Cache Strategies

| Strategy                         | Behavior                          | Use Case                        |
| -------------------------------- | --------------------------------- | ------------------------------- |
| `'static'`                       | Render once, cache forever        | About, Contact, Legal pages     |
| `'dynamic'`                      | No caching (default)              | User dashboards, real-time data |
| `{ revalidate: N }`              | Cache for N seconds, then refresh | Blog index, product listings    |
| `{ revalidate: N, tags: [...] }` | + on-demand invalidation          | CMS-driven content              |

### Type Definitions

```typescript
/** Render strategy configuration */
export type CacheStrategy =
	| 'static'
	| 'dynamic'
	| {
			/** Seconds until cache is considered stale */
			revalidate: number;
			/** Tags for on-demand invalidation */
			tags?: string[];
	  };

/** Extended page options */
export interface PageOptions<T, E = EcoPagesElement> {
	componentDir?: string;
	dependencies?: EcoComponentDependenciesWithLazy;
	layout?: EcoComponent<{ children: E }>;
	staticPaths?: GetStaticPaths;
	staticProps?: GetStaticProps<T>;
	metadata?: GetMetadata<T>;

	/** Cache configuration */
	cache?: CacheStrategy;

	render: (props: PagePropsFor<T>) => E | Promise<E>;
}
```

### Cache-Control Headers Mapping

| Strategy               | Cache-Control Header                                |
| ---------------------- | --------------------------------------------------- |
| `'static'`             | `public, max-age=31536000, immutable`               |
| `'dynamic'`            | `no-store, must-revalidate`                         |
| `{ revalidate: 3600 }` | `public, max-age=3600, stale-while-revalidate=7200` |

---

## Pluggable Cache Store Architecture

### Why Pluggable?

Different deployment scenarios need different caching solutions:

| Scenario                        | Best Cache Store      |
| ------------------------------- | --------------------- |
| Single server / Hobby project   | In-memory             |
| Multi-instance / Kubernetes     | Redis / Memcached     |
| Serverless (Vercel, Cloudflare) | KV store / Edge cache |
| Self-hosted with persistence    | Redis / File system   |

### Cache Store Interface

```typescript
/**
 * Abstract interface for cache storage backends.
 * Implementations must handle serialization/deserialization internally.
 */
export interface CacheStore {
	/** Retrieve an entry by key */
	get(key: string): Promise<CacheEntry | null>;

	/** Store an entry */
	set(key: string, entry: CacheEntry): Promise<void>;

	/** Delete a specific entry */
	delete(key: string): Promise<boolean>;

	/** Delete all entries matching tags */
	invalidateByTags(tags: string[]): Promise<number>;

	/** Delete entries by exact path */
	invalidateByPaths(paths: string[]): Promise<number>;

	/** Clear all entries */
	clear(): Promise<void>;

	/** Get cache statistics (optional, for debugging) */
	stats?(): Promise<CacheStats>;
}

interface CacheEntry {
	html: string;
	createdAt: number;
	revalidateAfter: number | null;
	tags: string[];
	etag: string;
}

interface CacheStats {
	entries: number;
	memoryUsage?: number;
	hitRate?: number;
}
```

### Built-in Implementations

#### 1. In-Memory Store (Default)

```typescript
/**
 * Simple in-memory cache store.
 * Suitable for single-instance deployments and development.
 */
export class MemoryCacheStore implements CacheStore {
	private cache = new Map<string, CacheEntry>();
	private tagIndex = new Map<string, Set<string>>();
	private readonly MAX_ENTRIES: number;

	constructor(options: { maxEntries?: number } = {}) {
		this.MAX_ENTRIES = options.maxEntries ?? 1000;
	}

	async get(key: string): Promise<CacheEntry | null> {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// LRU: Refresh entry position by re-inserting
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry;
	}

	async set(key: string, entry: CacheEntry): Promise<void> {
		// LRU: Evict oldest if limit reached
		if (this.cache.size >= this.MAX_ENTRIES && !this.cache.has(key)) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) await this.delete(firstKey);
		}

		this.cache.set(key, entry);

		// Index by tags for efficient invalidation
		for (const tag of entry.tags) {
			if (!this.tagIndex.has(tag)) {
				this.tagIndex.set(tag, new Set());
			}
			this.tagIndex.get(tag)!.add(key);
		}
	}

	async delete(key: string): Promise<boolean> {
		const entry = this.cache.get(key);
		if (!entry) return false;

		// Clean up tag index
		for (const tag of entry.tags) {
			this.tagIndex.get(tag)?.delete(key);
		}

		return this.cache.delete(key);
	}

	async invalidateByTags(tags: string[]): Promise<number> {
		let count = 0;
		for (const tag of tags) {
			const keys = this.tagIndex.get(tag);
			if (keys) {
				for (const key of keys) {
					if (this.cache.delete(key)) count++;
				}
				this.tagIndex.delete(tag);
			}
		}
		return count;
	}

	async invalidateByPaths(paths: string[]): Promise<number> {
		let count = 0;
		for (const path of paths) {
			// Cache key is the full URL path (including query if present)
			if (await this.delete(path)) count++;
		}
		return count;
	}

	async clear(): Promise<void> {
		this.cache.clear();
		this.tagIndex.clear();
	}
}
```

#### 2. Redis Store (Optional Package)

```typescript
// @ecopages/cache-redis (separate package)
import { createClient } from 'redis';

export class RedisCacheStore implements CacheStore {
	private client: ReturnType<typeof createClient>;
	private prefix: string;

	constructor(options: { url: string; prefix?: string }) {
		this.client = createClient({ url: options.url });
		this.prefix = options.prefix ?? 'eco:cache:';
	}

	async get(key: string): Promise<CacheEntry | null> {
		const data = await this.client.get(this.prefix + key);
		return data ? JSON.parse(data) : null;
	}

	async set(key: string, entry: CacheEntry): Promise<void> {
		const ttl = entry.revalidateAfter
			? Math.ceil((entry.revalidateAfter - Date.now()) / 1000) * 2 // 2x revalidate time
			: undefined;

		await this.client.set(this.prefix + key, JSON.stringify(entry), { EX: ttl });

		// Tag indexing using Redis Sets
		for (const tag of entry.tags) {
			await this.client.sAdd(`${this.prefix}tag:${tag}`, key);
		}
	}

	async invalidateByTags(tags: string[]): Promise<number> {
		let count = 0;
		for (const tag of tags) {
			const keys = await this.client.sMembers(`${this.prefix}tag:${tag}`);
			for (const key of keys) {
				await this.client.del(this.prefix + key);
				count++;
			}
			await this.client.del(`${this.prefix}tag:${tag}`);
		}
		return count;
	}

	// ... rest of implementation
}
```

### Configuration in eco.config.ts

EcoPages uses the `ConfigBuilder` pattern with fluent `set*` methods. Cache configuration follows this pattern:

```typescript
// eco.config.ts
import { ConfigBuilder } from '@ecopages/core';

const config = await new ConfigBuilder()
	.setBaseUrl('https://example.com')
	.setRootDir(import.meta.dir)
	.setIntegrations([
		/* ... */
	])

	// Cache configuration via setCacheConfig()
	.setCacheConfig({
		// Option 1: Use default in-memory store (simplest)
		store: 'memory',

		// Option 2: Custom store implementation
		// store: new RedisCacheStore({ url: process.env.REDIS_URL }),

		// Global default strategy for all pages
		defaultStrategy: 'static',

		// Disable caching entirely (useful for debugging)
		// enabled: false,
	})

	.build();

export default config;
```

### ConfigBuilder Integration

```typescript
// In ConfigBuilder class

export class ConfigBuilder {
	// ... existing config properties ...

	/**
	 * Sets the cache configuration for ISR and page caching.
	 *
	 * @param cacheConfig - The cache configuration object
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setCacheConfig(cacheConfig: CacheConfig): this {
		this.config.cache = cacheConfig;
		return this;
	}
}
```

### Type Definitions for Config

```typescript
// In internal-types.ts

export interface CacheConfig {
	/**
	 * Cache store implementation.
	 * @default 'memory'
	 */
	store?: 'memory' | CacheStore;

	/**
	 * Default cache strategy for pages that don't specify one.
	 * @default 'static'
	 */
	defaultStrategy?: CacheStrategy;

	/**
	 * Whether caching is enabled.
	 * Automatically disabled in dev mode unless explicitly set.
	 * @default true (production), false (development)
	 */
	enabled?: boolean;
}

export type EcoPagesAppConfig = {
	// ... existing properties ...

	/**
	 * Cache configuration for ISR and page caching.
	 */
	cache?: CacheConfig;
};
```

### Factory Pattern for Flexibility

```typescript
// packages/core/src/services/cache/cache-store-factory.ts

export type CacheStoreConfig = 'memory' | { type: 'memory'; maxEntries?: number; maxMemoryMB?: number } | CacheStore; // Custom implementation

export function createCacheStore(config: CacheStoreConfig): CacheStore {
	if (config === 'memory') {
		return new MemoryCacheStore();
	}

	if (typeof config === 'object' && 'type' in config) {
		if (config.type === 'memory') {
			return new MemoryCacheStore(config);
		}
		throw new Error(`Unknown cache store type: ${config.type}`);
	}

	// Assume it's a custom CacheStore implementation
	return config;
}
```

### Invalidation API

Two complementary approaches for cache invalidation:

#### 1. Tag-Based Invalidation

```typescript
// POST /api/_revalidate
// Body: { tags: string[], secret: string }
// Response: { revalidated: true, count: number }

// Example: Invalidate all blog-related pages
await fetch('/api/_revalidate', {
	method: 'POST',
	body: JSON.stringify({
		tags: ['blog'],
		secret: process.env.REVALIDATION_SECRET,
	}),
});
```

#### 2. Path-Based Invalidation (for dynamic routes)

```typescript
// POST /api/_revalidate
// Body: { paths: string[], secret: string }
// Response: { revalidated: true, paths: string[] }

// Example: Invalidate a specific blog post
await fetch('/api/_revalidate', {
	method: 'POST',
	body: JSON.stringify({
		paths: ['/blog/my-specific-post'],
		secret: process.env.REVALIDATION_SECRET,
	}),
});

// Example: Invalidate multiple specific pages
await fetch('/api/_revalidate', {
	method: 'POST',
	body: JSON.stringify({
		paths: ['/blog/post-1', '/blog/post-2', '/products/shoes'],
		secret: process.env.REVALIDATION_SECRET,
	}),
});
```

#### Combined Request

```typescript
// Invalidate by both tags AND specific paths in one request
await fetch('/api/_revalidate', {
	method: 'POST',
	body: JSON.stringify({
		tags: ['inventory'], // All inventory-tagged pages
		paths: ['/products/featured'], // Plus this specific page
		secret: process.env.REVALIDATION_SECRET,
	}),
});
```

This approach keeps things explicit and simple:

- Use `tags` for categorical invalidation ("refresh all blog posts")
- Use `paths` for surgical invalidation ("refresh this exact page")
- No magic auto-tagging that could be confusing

---

## Implementation Plan

### Phase 1: Type Definitions & Pass-Through

- [ ] Add `CacheStrategy` type to `eco.types.ts`
- [ ] Add `cache` property to `PageOptions`
- [ ] Update `eco.page()` to attach cache config to component
- [ ] Pass cache config through render pipeline
- [ ] No behavioral changes yet

### Phase 2: Cache Store Interface & Memory Implementation

- [ ] Create `CacheStore` interface
- [ ] Implement `MemoryCacheStore` with LRU eviction
- [ ] Add `CacheEntry` type with all ISR fields
- [ ] Implement tag indexing for invalidation
- [ ] Add factory function `createCacheStore()`

### Phase 3: Page Cache Service (ISR Core)

- [ ] Create `PageCacheService` class
- [ ] Implement cache key generation (URL + params)
- [ ] Implement `getOrCreate()` with stale-while-revalidate
- [ ] Implement background regeneration with deduplication
- [ ] Add regeneration lock/promise sharing

### Phase 4: Integration with Response Pipeline

- [ ] Integrate `PageCacheService` with `FileSystemResponseMatcher`
- [ ] Extract cache strategy from rendered page
- [ ] Generate appropriate `Cache-Control` headers
- [ ] Add `X-Cache` header for debugging (hit/miss/stale)

### Phase 5: Tag-Based Invalidation API

- [ ] Implement `invalidateByTags()` in cache service
- [ ] Create `/api/_revalidate` endpoint
- [ ] Add secret-based authentication
- [ ] Document webhook integration patterns

### Phase 6: App Configuration

- [ ] Add `cache` section to `EcoPagesAppConfig`
- [ ] Support `store` configuration (memory, custom)
- [ ] Support `defaultStrategy` configuration
- [ ] Support `enabled` flag (disable in dev)
- [ ] Update `ConfigBuilder` to handle cache config

### Phase 7: Dev Mode & Debugging

- [ ] Disable caching in dev mode by default
- [ ] Add cache hit/miss logging
- [ ] Add cache stats endpoint (optional)
- [ ] Consider: cache inspector in dev tools?

### Phase 8: Redis Store (Separate Package)

- [ ] Create `@ecopages/cache-redis` package
- [ ] Implement `RedisCacheStore`
- [ ] Handle connection lifecycle
- [ ] Document setup and usage

### Phase 9: Documentation & Examples

- [ ] Update `eco.page()` documentation
- [ ] Add caching guide to docs site
- [ ] Create example pages with different strategies
- [ ] Document ISR patterns and best practices
- [ ] Document webhook integration examples

---

## Open Questions

> Add questions here as they come up during implementation

1. **Cache key composition**: Should query params be included in cache key by default?
    - **Decision**: Yes, include query params. Full URL is the cache key.
    - **Rationale**: Essential for pagination (`?page=2`) and filters (`?cat=shoes`).
    - **Safety**: Protected by `maxEntries` LRU eviction in MemoryStore to prevent DoS via random query params. [2026-01-19]

2. **Dev mode behavior**: Should caching be completely disabled in dev?
    - **Decision**: Yes, disabled by default in dev mode. [2026-01-18]

3. **Memory limits**: Should we add LRU eviction or max entries?
    - **Decision**: YES. Critical for preventing DoS attacks on the memory store. Added `maxEntries` limit with LRU eviction. [2026-01-19]

4. **Dynamic routes with static strategy**: Allow `cache: 'static'` on `[slug].tsx`?
    - **Decision**: Yes, each unique param combination gets its own cache entry. [2026-01-18]
    - **Invalidation approach**: Two options:
        - A) Auto-include params in tags (e.g., `[slug].tsx` with `slug=hello` → auto-tag `slug:hello`)
        - B) Direct path invalidation API: `revalidatePath('/blog/hello')` alongside `revalidateTag('blog')`
    - **Leaning**: Option B is simpler and more explicit. Magic auto-tags could be confusing.

5. **Integration with SSG**: Should `cache` config affect build behavior?
    - **Decision**: No, SSG always pre-renders. Cache config is server-mode only. [2026-01-18]

6. ~~**Default strategy**: What should the default be?~~
    - **Decision**: `'static'` - EcoPages is static-first [2026-01-18]

7. **Stale content max age**: Should there be a hard limit on how stale content can be?
    - **Decision**: TBD - defer until we have real-world usage data

8. **Regeneration concurrency**: How to handle multiple requests triggering regen?
    - **Decision**: TBD - start simple (first wins), optimize if needed

---

## Decision Log

> Record important decisions and their rationale

| Date       | Decision                         | Rationale                                                                    |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------- |
| 2026-01-18 | Property name: `cache`           | Short, matches HTTP terminology, avoids confusion with `render()` function   |
| 2026-01-18 | Default: `'static'`              | EcoPages is static-first; dynamic should be opt-in                           |
| 2026-01-18 | Pluggable cache store            | Define interface, implement adapters (memory, Redis, etc.) for flexibility   |
| 2026-01-18 | Skip LRU for now                 | At scale where memory matters, Redis is the answer. Keep in-memory simple.   |
| 2026-01-18 | Path-based invalidation          | Explicit `paths: ['/blog/slug']` over magic auto-tags. Simpler mental model. |
| 2026-01-18 | Query params in cache key        | Full URL (path + query) is the cache key. Simple and predictable.            |
| 2026-01-18 | `ConfigBuilder.setCacheConfig()` | Follows existing pattern with fluent `set*` methods                          |
|            |                                  |                                                                              |

---

## References

- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [11ty Data Cascade](https://www.11ty.dev/docs/data-cascade/)
- [HTTP Caching (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Stale-While-Revalidate](https://web.dev/stale-while-revalidate/)

---

## Notes & Scratchpad

> Use this section for rough notes during iteration

### Architecture Understanding

EcoPages uses:

- **ConfigBuilder** - Fluent builder pattern with `set*` methods
- **Internal types** in `internal-types.ts` - `EcoPagesAppConfig` and friends
- **Public types** in `public-types.ts` - User-facing types
- **Processors** - Map-based, set via `setProcessors()` or `addProcessor()`
- **Loaders** - Bun plugins, set via `setLoaders()` or `addLoader()`
- **Integrations** - Plugins for different templating (ghtml, kita, react)

Cache config should follow this pattern with `setCacheConfig()`.

### Next Steps

1. Review updated RFC
2. Start Phase 1 (types) - add to eco.types.ts and internal-types.ts
3. Phase 2 (CacheStore interface + MemoryCacheStore)

### Ideas to Explore

- Cache warming on startup (pre-populate from SSG output?)
- Preload hints for related pages
- Integration with `staticProps` for cache-aware data fetching
- Partial hydration + caching (cache shell, hydrate dynamic parts)

### ISR Gotchas to Remember

- Background regen must not block response
- Need graceful handling of regen failures
- Tag invalidation should be O(tags) not O(entries)

### Related Ecosystem Features

- `staticProps` already supports async data fetching
- `staticPaths` generates paths at build time
- Browser router has its own prefetch cache (different layer)

### Naming Alternatives Considered

- `cache` vs `render` vs `strategy` - chose `cache` (HTTP terminology)
- `revalidate` vs `ttl` vs `maxAge` - chose `revalidate` (Next.js familiarity)
- `tags` vs `keys` vs `groups` - chose `tags` (industry standard)

### Invalidation API Design

Chose explicit `tags` + `paths` over magic auto-tagging because:

- Simpler mental model
- No hidden behavior
- User explicitly chooses "refresh all blogs" vs "refresh this one post"
- Works naturally with CMS webhooks that know the affected paths
