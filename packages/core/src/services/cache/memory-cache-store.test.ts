/**
 * Unit tests for MemoryCacheStore
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { MemoryCacheStore } from './memory-cache-store.ts';
import type { CacheEntry } from './cache.types.ts';

function createEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
	return {
		html: '<html>test</html>',
		createdAt: Date.now(),
		revalidateAfter: null,
		tags: [],
		strategy: 'static',
		...overrides,
	};
}

describe('MemoryCacheStore', () => {
	let store: MemoryCacheStore;

	beforeEach(() => {
		store = new MemoryCacheStore();
	});

	describe('get/set', () => {
		test('should return null for cache miss', async () => {
			const result = await store.get('/nonexistent');
			expect(result).toBeNull();
		});

		test('should store and retrieve an entry', async () => {
			const entry = createEntry({ html: '<html>hello</html>' });
			await store.set('/page', entry);
			const result = await store.get('/page');
			expect(result?.html).toBe('<html>hello</html>');
		});

		test('should update existing entry', async () => {
			await store.set('/page', createEntry({ html: '<html>v1</html>' }));
			await store.set('/page', createEntry({ html: '<html>v2</html>' }));
			const result = await store.get('/page');
			expect(result?.html).toBe('<html>v2</html>');
		});
	});

	describe('LRU eviction', () => {
		test('should evict oldest entry when maxEntries reached', async () => {
			const smallStore = new MemoryCacheStore({ maxEntries: 3 });

			await smallStore.set('/page1', createEntry());
			await smallStore.set('/page2', createEntry());
			await smallStore.set('/page3', createEntry());

			await smallStore.set('/page4', createEntry());

			expect(await smallStore.get('/page1')).toBeNull();
			expect(await smallStore.get('/page2')).not.toBeNull();
			expect(await smallStore.get('/page3')).not.toBeNull();
			expect(await smallStore.get('/page4')).not.toBeNull();
		});

		test('should refresh entry position on access', async () => {
			const smallStore = new MemoryCacheStore({ maxEntries: 3 });

			await smallStore.set('/page1', createEntry());
			await smallStore.set('/page2', createEntry());
			await smallStore.set('/page3', createEntry());

			await smallStore.get('/page1');

			await smallStore.set('/page4', createEntry());

			expect(await smallStore.get('/page1')).not.toBeNull();
			expect(await smallStore.get('/page2')).toBeNull();
			expect(await smallStore.get('/page3')).not.toBeNull();
			expect(await smallStore.get('/page4')).not.toBeNull();
		});

		test('should not evict when updating existing key', async () => {
			const smallStore = new MemoryCacheStore({ maxEntries: 3 });

			await smallStore.set('/page1', createEntry());
			await smallStore.set('/page2', createEntry());
			await smallStore.set('/page3', createEntry());

			await smallStore.set('/page1', createEntry({ html: '<html>updated</html>' }));

			const stats = await smallStore.stats();
			expect(stats.entries).toBe(3);
			expect((await smallStore.get('/page1'))?.html).toBe('<html>updated</html>');
		});

		test('should refresh entry position on update (move to most recent)', async () => {
			const smallStore = new MemoryCacheStore({ maxEntries: 3 });

			await smallStore.set('/page1', createEntry({ html: '<html>v1</html>' }));
			await smallStore.set('/page2', createEntry());
			await smallStore.set('/page3', createEntry());

			await smallStore.set('/page1', createEntry({ html: '<html>v2</html>' }));

			await smallStore.set('/page4', createEntry());

			expect(await smallStore.get('/page1')).not.toBeNull();
			expect(await smallStore.get('/page2')).toBeNull();
			expect(await smallStore.get('/page3')).not.toBeNull();
			expect(await smallStore.get('/page4')).not.toBeNull();
		});
	});

	describe('delete', () => {
		test('should delete an entry', async () => {
			await store.set('/page', createEntry());
			const deleted = await store.delete('/page');
			expect(deleted).toBe(true);
			expect(await store.get('/page')).toBeNull();
		});

		test('should return false for non-existent entry', async () => {
			const deleted = await store.delete('/nonexistent');
			expect(deleted).toBe(false);
		});
	});

	describe('invalidateByTags', () => {
		test('should invalidate all entries with matching tag', async () => {
			await store.set('/blog/1', createEntry({ tags: ['blog'] }));
			await store.set('/blog/2', createEntry({ tags: ['blog'] }));
			await store.set('/about', createEntry({ tags: ['static'] }));

			const count = await store.invalidateByTags(['blog']);
			expect(count).toBe(2);
			expect(await store.get('/blog/1')).toBeNull();
			expect(await store.get('/blog/2')).toBeNull();
			expect(await store.get('/about')).not.toBeNull();
		});

		test('should handle multiple tags', async () => {
			await store.set('/blog/1', createEntry({ tags: ['blog', 'featured'] }));
			await store.set('/product/1', createEntry({ tags: ['product'] }));

			const count = await store.invalidateByTags(['blog', 'product']);
			expect(count).toBe(2);
		});

		test('should return 0 for non-matching tags', async () => {
			await store.set('/page', createEntry({ tags: ['blog'] }));
			const count = await store.invalidateByTags(['nonexistent']);
			expect(count).toBe(0);
		});

		test('should clean up all tag references when entry has multiple tags', async () => {
			await store.set('/blog/featured', createEntry({ tags: ['blog', 'featured', 'homepage'] }));
			await store.set('/blog/regular', createEntry({ tags: ['blog'] }));
			await store.set('/featured-product', createEntry({ tags: ['featured', 'product'] }));

			const count = await store.invalidateByTags(['blog']);
			expect(count).toBe(2);

			expect(await store.get('/blog/featured')).toBeNull();
			expect(await store.get('/blog/regular')).toBeNull();
			expect(await store.get('/featured-product')).not.toBeNull();

			const countFeatured = await store.invalidateByTags(['featured']);
			expect(countFeatured).toBe(1);
			expect(await store.get('/featured-product')).toBeNull();
		});

		test('should not leave orphaned tag references after invalidation', async () => {
			await store.set('/page1', createEntry({ tags: ['tagA', 'tagB'] }));

			await store.invalidateByTags(['tagA']);

			expect(await store.get('/page1')).toBeNull();

			await store.set('/page2', createEntry({ tags: ['tagB'] }));
			const count = await store.invalidateByTags(['tagB']);
			expect(count).toBe(1);
		});
	});

	describe('invalidateByPaths', () => {
		test('should invalidate specific paths', async () => {
			await store.set('/blog/1', createEntry());
			await store.set('/blog/2', createEntry());

			const count = await store.invalidateByPaths(['/blog/1']);
			expect(count).toBe(1);
			expect(await store.get('/blog/1')).toBeNull();
			expect(await store.get('/blog/2')).not.toBeNull();
		});

		test('should handle multiple paths', async () => {
			await store.set('/blog/1', createEntry());
			await store.set('/blog/2', createEntry());
			await store.set('/about', createEntry());

			const count = await store.invalidateByPaths(['/blog/1', '/about']);
			expect(count).toBe(2);
		});
	});

	describe('clear', () => {
		test('should remove all entries', async () => {
			await store.set('/page1', createEntry());
			await store.set('/page2', createEntry());
			await store.clear();

			const stats = await store.stats();
			expect(stats.entries).toBe(0);
		});
	});

	describe('stats', () => {
		test('should return entry count', async () => {
			await store.set('/page1', createEntry());
			await store.set('/page2', createEntry());

			const stats = await store.stats();
			expect(stats.entries).toBe(2);
		});
	});
});
