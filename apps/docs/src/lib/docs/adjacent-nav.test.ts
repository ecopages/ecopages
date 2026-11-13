import { describe, expect, it } from 'vitest';
import { findAdjacentNavItems, flattenDocsNav } from './adjacent-nav';

const nav = {
	sections: [
		{
			items: [
				{ href: '/docs/a/one', title: 'One' },
				{ href: '/docs/a/two', title: 'Two' },
			],
		},
		{ items: [{ href: '/docs/b/three', title: 'Three' }] },
	],
};

describe('flattenDocsNav', () => {
	it('lists pages in sidebar order across sections', () => {
		expect(flattenDocsNav(nav).map((page) => page.title)).toEqual(['One', 'Two', 'Three']);
	});
});

describe('findAdjacentNavItems', () => {
	it('returns the neighbours of a middle page, across a section boundary', () => {
		const adjacent = findAdjacentNavItems(nav, '/docs/a/two');

		expect(adjacent?.prev?.href).toBe('/docs/a/one');
		expect(adjacent?.next?.href).toBe('/docs/b/three');
	});

	it('has no previous link on the first page and no next link on the last', () => {
		expect(findAdjacentNavItems(nav, '/docs/a/one')?.prev).toBeNull();
		expect(findAdjacentNavItems(nav, '/docs/b/three')?.next).toBeNull();
	});

	it('returns null for a page that is not in the nav', () => {
		expect(findAdjacentNavItems(nav, '/docs/missing')).toBeNull();
	});
});
