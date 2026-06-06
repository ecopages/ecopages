import { describe, expect, it } from 'vitest';
import { ModuleParseCache, moduleParseCache, cachedParseSync } from './module-parse-cache.ts';

describe('ModuleParseCache', () => {
	it('returns the same result for identical (path, source, options)', () => {
		const cache = new ModuleParseCache();
		const source = 'export const x = 1;';
		const first = cache.getOrParse('/a.ts', source, { sourceType: 'module' });
		const second = cache.getOrParse('/a.ts', source, { sourceType: 'module' });
		expect(second).toBe(first);
		expect(cache.stats().hits).toBe(1);
		expect(cache.stats().misses).toBe(1);
	});

	it('re-parses when source changes', () => {
		const cache = new ModuleParseCache();
		const a = cache.getOrParse('/a.ts', 'export const x = 1;');
		const b = cache.getOrParse('/a.ts', 'export const x = 2;');
		expect(b).not.toBe(a);
		expect(cache.stats().misses).toBe(2);
	});

	it('re-parses when options differ', () => {
		const cache = new ModuleParseCache();
		const source = 'export const x = 1;';
		const a = cache.getOrParse('/a.ts', source, { sourceType: 'module' });
		const b = cache.getOrParse('/a.ts', source, { sourceType: 'script' });
		expect(b).not.toBe(a);
	});

	it('does not cross-contaminate across file paths', () => {
		const cache = new ModuleParseCache();
		const source = 'export const x = 1;';
		const a = cache.getOrParse('/a.ts', source);
		const b = cache.getOrParse('/b.ts', source);
		expect(b).not.toBe(a);
	});

	it('evicts oldest entry when capacity exceeded', () => {
		const cache = new ModuleParseCache(2);
		cache.getOrParse('/a.ts', 'a');
		cache.getOrParse('/b.ts', 'b');
		cache.getOrParse('/c.ts', 'c');
		expect(cache.size).toBe(2);
		// /a.ts should have been evicted
		const d = cache.getOrParse('/a.ts', 'a');
		expect(d).toBeDefined();
		expect(cache.size).toBe(2);
	});

	it('clear() resets state', () => {
		const cache = new ModuleParseCache();
		cache.getOrParse('/a.ts', 'export const x = 1;');
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.stats().hits).toBe(0);
		expect(cache.stats().misses).toBe(0);
	});

	it('cachedParseSync uses the shared default cache', () => {
		const source = 'export const y = 1;';
		const a = cachedParseSync('/y.ts', source);
		const b = cachedParseSync('/y.ts', source);
		expect(b).toBe(a);
		// Re-touching hits the same instance, so its stats reflect our call.
		const stats = moduleParseCache.stats();
		expect(stats.hits).toBeGreaterThanOrEqual(1);
	});

	it('throws on invalid maxEntries', () => {
		expect(() => new ModuleParseCache(0)).toThrow();
	});
});
