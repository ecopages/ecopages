import { describe, expect, it } from 'vitest';
import { AliasResolverCache } from './alias-resolver-cache.ts';

describe('AliasResolverCache', () => {
	const srcDir = '/app/src';
	const specifier = '@/components/Button';

	it('misses on first lookup', () => {
		const cache = new AliasResolverCache();
		expect(cache.get(srcDir, specifier)).toEqual({ hit: false });
		expect(cache.stats().misses).toBe(1);
	});

	it('hits after a set', () => {
		const cache = new AliasResolverCache();
		cache.set(srcDir, specifier, '/app/src/components/Button.tsx');
		expect(cache.get(srcDir, specifier)).toEqual({
			hit: true,
			resolved: '/app/src/components/Button.tsx',
		});
		expect(cache.stats().hits).toBe(1);
	});

	it('caches negative results (unresolvable specifier)', () => {
		const cache = new AliasResolverCache();
		cache.set(srcDir, '@/missing', undefined);
		expect(cache.get(srcDir, '@/missing')).toEqual({ hit: true, resolved: undefined });
	});

	it('different srcDirs do not collide', () => {
		const cache = new AliasResolverCache();
		cache.set('/app1/src', specifier, '/app1/src/components/Button.tsx');
		cache.set('/app2/src', specifier, '/app2/src/components/Button.tsx');
		expect(cache.get('/app1/src', specifier)).toEqual({
			hit: true,
			resolved: '/app1/src/components/Button.tsx',
		});
		expect(cache.get('/app2/src', specifier)).toEqual({
			hit: true,
			resolved: '/app2/src/components/Button.tsx',
		});
	});

	it('evicts oldest entry when capacity exceeded', () => {
		const cache = new AliasResolverCache(2);
		cache.set('/a/src', '@/x', '/a/x.ts');
		cache.set('/b/src', '@/y', '/b/y.ts');
		cache.set('/c/src', '@/z', '/c/z.ts');
		expect(cache.size).toBe(2);
		// /a/src @/x should have been evicted
		expect(cache.get('/a/src', '@/x')).toEqual({ hit: false });
	});

	it('invalidateUnder drops all entries under a rootDir', () => {
		const cache = new AliasResolverCache();
		cache.set('/app/src', '@/a', '/app/src/a.ts');
		cache.set('/app/src', '@/b', '/app/src/b.ts');
		cache.set('/other/src', '@/c', '/other/src/c.ts');
		const removed = cache.invalidateUnder('/app/src');
		expect(removed).toBe(2);
		expect(cache.size).toBe(1);
		expect(cache.get('/other/src', '@/c')).toEqual({ hit: true, resolved: '/other/src/c.ts' });
	});

	it('invalidateUnder treats sibling paths with shared prefix as distinct', () => {
		// Regression: a previous startsWith-based check would match
		// '/app/src-foo' against '/app/src/'. The path-aware check
		// normalizes and only matches true descendants.
		const cache = new AliasResolverCache();
		cache.set('/app/src', '@/a', '/app/src/a.ts');
		cache.set('/app/src-foo', '@/b', '/app/src-foo/b.ts');
		const removed = cache.invalidateUnder('/app/src');
		expect(removed).toBe(1);
		expect(cache.size).toBe(1);
		expect(cache.get('/app/src-foo', '@/b')).toEqual({
			hit: true,
			resolved: '/app/src-foo/b.ts',
		});
	});

	it('invalidateUnder handles deep nested descendants', () => {
		// Validates path.relative walks arbitrarily deep hierarchies.
		const cache = new AliasResolverCache();
		cache.set('/app/src', '@/a', '/app/src/a.ts');
		cache.set('/app/src/components/buttons/primary', '@/b', '/app/src/components/buttons/primary/b.ts');
		cache.set('/app/other', '@/c', '/app/other/c.ts');
		const removed = cache.invalidateUnder('/app/src');
		expect(removed).toBe(2);
		expect(cache.size).toBe(1);
		expect(cache.get('/app/other', '@/c')).toEqual({ hit: true, resolved: '/app/other/c.ts' });
	});

	it('invalidateUnder returns 0 on empty cache', () => {
		const cache = new AliasResolverCache();
		expect(cache.invalidateUnder('/app/src')).toBe(0);
	});

	it('clear() resets state', () => {
		const cache = new AliasResolverCache();
		cache.set(srcDir, specifier, '/app/src/Button.tsx');
		cache.get(srcDir, specifier);
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.stats().hits).toBe(0);
	});

	it('throws on invalid maxEntries', () => {
		expect(() => new AliasResolverCache(0)).toThrow();
	});
});
