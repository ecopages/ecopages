import { describe, expect, it } from 'vitest';
import { ClientGraphBoundaryCache, hashAllowList } from './boundary-cache.ts';

describe('ClientGraphBoundaryCache', () => {
	const filePath = '/a.ts';
	const allowList = new Map<string, Set<string> | '*'>([
		['react', '*'],
		['react-dom', '*'],
	]);

	it('misses when inbound requested exports differ', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set(
			'/entry.tsx',
			'export const one = 1;',
			new Map(),
			{
				transformed: 'export const one = 1;',
				modified: false,
				rulesAdded: new Map(),
			},
			new Set(['one']),
		);
		expect(cache.get('/entry.tsx', 'export const one = 1;', new Map(), new Set(['two']))).toBeUndefined();
	});

	it('misses when allow-list export rules differ for the same package', () => {
		const cache = new ClientGraphBoundaryCache();
		const readOnlyFs = new Map<string, Set<string> | '*'>([['node:fs', new Set(['readFileSync'])]]);
		const writeFs = new Map<string, Set<string> | '*'>([['node:fs', new Set(['writeFileSync'])]]);
		cache.set(filePath, 'src', readOnlyFs, {
			transformed: 'src',
			modified: false,
			rulesAdded: new Map(),
		});
		expect(cache.get(filePath, 'src', writeFs)).toBeUndefined();
		expect(hashAllowList(readOnlyFs)).not.toBe(hashAllowList(writeFs));
	});

	it('returns undefined for an uncached file', () => {
		const cache = new ClientGraphBoundaryCache();
		expect(cache.get(filePath, 'export const x = 1;', allowList)).toBeUndefined();
	});

	it('returns the cached entry when inputs match', () => {
		const cache = new ClientGraphBoundaryCache();
		const entry = {
			transformed: 'export const x = 1;',
			modified: true,
			rulesAdded: new Map(),
		};
		cache.set(filePath, 'export const x = 1;', allowList, entry);
		const hit = cache.get(filePath, 'export const x = 1;', allowList);
		expect(hit).toBeDefined();
		expect(hit?.modified).toBe(true);
		expect(cache.stats().hits).toBe(1);
		expect(cache.stats().misses).toBe(0);
	});

	it('misses when source changes', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set(filePath, 'export const x = 1;', allowList, {
			transformed: 'export const x = 1;',
			modified: true,
			rulesAdded: new Map(),
		});
		expect(cache.get(filePath, 'export const x = 2;', allowList)).toBeUndefined();
	});

	it('misses when allow list package set changes', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set(filePath, 'src', allowList, {
			transformed: 'src',
			modified: false,
			rulesAdded: new Map(),
		});
		expect(
			cache.get(
				filePath,
				'src',
				new Map([
					['react', '*'],
					['react-dom', '*'],
					['lit', '*'],
				]),
			),
		).toBeUndefined();
	});

	it('evicts oldest entry when capacity exceeded', () => {
		const cache = new ClientGraphBoundaryCache(2);
		cache.set('/a', 'a', allowList, { transformed: 'a', modified: false, rulesAdded: new Map() });
		cache.set('/b', 'b', allowList, { transformed: 'b', modified: false, rulesAdded: new Map() });
		cache.set('/c', 'c', allowList, { transformed: 'c', modified: false, rulesAdded: new Map() });
		expect(cache.size).toBe(2);
		expect(cache.get('/a', 'a', allowList)).toBeUndefined();
	});

	it('invalidate(filePath) removes only that entry', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set('/a', 'a', allowList, { transformed: 'a', modified: false, rulesAdded: new Map() });
		cache.set('/b', 'b', allowList, { transformed: 'b', modified: false, rulesAdded: new Map() });
		cache.invalidate('/a');
		expect(cache.size).toBe(1);
		expect(cache.get('/a', 'a', allowList)).toBeUndefined();
		expect(cache.get('/b', 'b', allowList)).toBeDefined();
	});

	it('invalidateMatching(predicate) returns count of removed entries', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set('/src/a', 'a', allowList, { transformed: 'a', modified: false, rulesAdded: new Map() });
		cache.set('/src/b', 'b', allowList, { transformed: 'b', modified: false, rulesAdded: new Map() });
		cache.set('/other/c', 'c', allowList, { transformed: 'c', modified: false, rulesAdded: new Map() });
		const removed = cache.invalidateMatching((p) => p.startsWith('/src/'));
		expect(removed).toBe(2);
		expect(cache.size).toBe(1);
	});

	it('clear() resets state', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set('/a', 'a', allowList, { transformed: 'a', modified: false, rulesAdded: new Map() });
		cache.get('/a', 'a', allowList);
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.stats().hits).toBe(0);
	});

	it('throws on invalid maxEntries', () => {
		expect(() => new ClientGraphBoundaryCache(0)).toThrow();
	});

	it('defensive copy of Set rulesAdded prevents cross-contamination', () => {
		const cache = new ClientGraphBoundaryCache();
		const originalRules = new Set(['Foo', 'Bar']);
		cache.set('/a', 'a', allowList, {
			transformed: 'a',
			modified: false,
			rulesAdded: new Map([['/b', originalRules]]),
		});
		originalRules.add('Baz');
		const cached = cache.get('/a', 'a', allowList);
		const cachedRules = cached?.rulesAdded.get('/b');
		expect(cachedRules).toBeInstanceOf(Set);
		expect((cachedRules as Set<string>).size).toBe(2);
	});

	it('rulesAdded stores the after-state, not just additions (Set growth)', () => {
		const cache = new ClientGraphBoundaryCache();
		const grown = new Set(['Foo', 'Bar']);
		cache.set('/b', 'b', allowList, {
			transformed: 'b',
			modified: true,
			rulesAdded: new Map([['/local', grown]]),
		});
		const cached = cache.get('/b', 'b', allowList);
		expect(cached?.rulesAdded.get('/local')).toBeInstanceOf(Set);
		expect([...(cached!.rulesAdded.get('/local') as Set<string>)].sort()).toEqual(['Bar', 'Foo']);
	});

	it('rulesAdded stores the after-state when a key is promoted to *', () => {
		const cache = new ClientGraphBoundaryCache();
		cache.set('/b', 'b', allowList, {
			transformed: 'b',
			modified: true,
			rulesAdded: new Map([['/local', '*']]),
		});
		const cached = cache.get('/b', 'b', allowList);
		expect(cached?.rulesAdded.get('/local')).toBe('*');
	});
});
