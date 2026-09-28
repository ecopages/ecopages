import { describe, expect, it } from 'vitest';
import { ModuleParseCache, parseModuleSource } from './module-parse-cache.ts';

describe('ModuleParseCache', () => {
	it('returns the same result for identical (path, source, options)', () => {
		const cache = new ModuleParseCache();
		const source = 'export const x = 1;';
		const first = cache.getOrParse('/a.ts', source, { sourceType: 'module' });
		const second = cache.getOrParse('/a.ts', source, { sourceType: 'module' });
		expect(second).toBe(first);
	});

	it('re-parses when source changes', () => {
		const cache = new ModuleParseCache();
		const a = cache.getOrParse('/a.ts', 'export const x = 1;');
		const b = cache.getOrParse('/a.ts', 'export const x = 2;');
		expect(b).not.toBe(a);
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

	it('normalizes omitted source options to the same cache entry', () => {
		const cache = new ModuleParseCache();
		const source = 'export const Component = <div />;';
		const implicit = cache.getOrParse('/component.jsx', source);
		const explicit = cache.getOrParse('/component.jsx', source, { lang: 'jsx', sourceType: 'module' });
		expect(explicit).toBe(implicit);
	});

	it('evicts the least recently used entry when capacity is exceeded', () => {
		const cache = new ModuleParseCache(2);
		const a = cache.getOrParse('/a.ts', 'a');
		const b = cache.getOrParse('/b.ts', 'b');
		cache.getOrParse('/c.ts', 'c');

		expect(cache.getOrParse('/b.ts', 'b')).toBe(b);
		expect(cache.getOrParse('/a.ts', 'a')).not.toBe(a);
	});

	it('parseModuleSource uses the shared default cache', () => {
		const source = 'export const y = 1;';
		const a = parseModuleSource('/y.ts', source);
		const b = parseModuleSource('/y.ts', source);
		expect(b).toBe(a);
	});

	it('throws on invalid maxEntries', () => {
		expect(() => new ModuleParseCache(0)).toThrow();
	});
});
