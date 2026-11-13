import { describe, expect, it } from 'vitest';
import { buildDocsCrumbs } from './docs-crumbs';

const nav = {
	sections: [
		{
			id: 'getting-started',
			title: 'Getting started',
			items: [{ slug: 'introduction', title: 'Introduction', href: '/docs/getting-started/introduction' }],
		},
		{
			id: 'guides',
			title: 'Guides',
			items: [
				{ slug: 'writing', title: 'Writing', href: '/docs/guides/writing' },
				{ slug: 'deploying', title: 'Deploying', href: '/docs/guides/deploying' },
			],
		},
	],
};

describe('buildDocsCrumbs', () => {
	it('links Docs to the first page of the set and the section to its first page', () => {
		expect(buildDocsCrumbs(nav, 'guides', 'deploying')).toEqual([
			{ label: 'Docs', href: '/docs/getting-started/introduction' },
			{ label: 'Guides', href: '/docs/guides/writing' },
			{ label: 'Deploying' },
		]);
	});

	it('prepends the home crumb when asked', () => {
		const crumbs = buildDocsCrumbs(nav, 'guides', 'writing', { home: { label: 'Home', href: '/' } });

		expect(crumbs[0]).toEqual({ label: 'Home', href: '/' });
		expect(crumbs).toHaveLength(4);
	});

	it('returns no trail for a page outside the nav', () => {
		expect(buildDocsCrumbs(nav, 'guides', 'missing')).toEqual([]);
		expect(buildDocsCrumbs(nav, undefined, undefined)).toEqual([]);
	});
});
