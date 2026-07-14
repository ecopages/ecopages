import { expect, test } from 'vitest';
import type { DocsNav } from '@/lib/content-nav';
import { resolveDocsBreadcrumb } from './resolve-docs-breadcrumb';

const sampleNav = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			icon: () => null,
			items: [
				{
					title: 'Introduction',
					href: '/docs/getting-started/introduction',
					section: 'getting-started',
					slug: 'introduction',
				},
			],
		},
		{
			id: 'core',
			title: 'Core Concepts',
			icon: () => null,
			items: [
				{
					title: 'HMR',
					href: '/docs/core/hmr',
					section: 'core',
					slug: 'hmr',
				},
			],
		},
	],
} satisfies DocsNav;

test('resolveDocsBreadcrumb returns docs, section, and page labels', () => {
	const crumbs = resolveDocsBreadcrumb(sampleNav, 'core', 'hmr');

	expect(crumbs).toEqual([
		{ label: 'Docs', href: '/docs/getting-started/introduction' },
		{ label: 'Core Concepts', href: '/docs/core/hmr' },
		{ label: 'HMR' },
	]);
});

test('resolveDocsBreadcrumb returns empty for unknown pages', () => {
	expect(resolveDocsBreadcrumb(sampleNav, 'missing', 'page')).toEqual([]);
});
