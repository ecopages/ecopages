import { describe, expect, it } from 'vitest';
import { AliasResolverCache } from './alias-resolver-cache.ts';

describe('AliasResolverCache', () => {
	const srcDir = '/app/src';
	const specifier = '@/components/Button';

	it('misses on first lookup', () => {
		const cache = new AliasResolverCache();
		expect(cache.get(srcDir, specifier)).toEqual({ hit: false });
	});

	it('hits after a set', () => {
		const cache = new AliasResolverCache();
		cache.set(srcDir, specifier, '/app/src/components/Button.tsx');
		expect(cache.get(srcDir, specifier)).toEqual({
			hit: true,
			resolved: '/app/src/components/Button.tsx',
		});
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
		expect(cache.get('/a/src', '@/x')).toEqual({ hit: false });
		expect(cache.get('/b/src', '@/y')).toEqual({ hit: true, resolved: '/b/y.ts' });
		expect(cache.get('/c/src', '@/z')).toEqual({ hit: true, resolved: '/c/z.ts' });
	});

	it('throws on invalid maxEntries', () => {
		expect(() => new AliasResolverCache(0)).toThrow();
	});
});
