import { expect, test } from 'vitest';
import { resolveDocsBreadcrumb } from './resolve-docs-breadcrumb';

const sampleNav = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			pages: [{ slug: 'introduction', title: 'Introduction', description: 'Intro.', content: () => null }],
		},
		{
			id: 'core',
			title: 'Core Concepts',
			pages: [{ slug: 'hmr', title: 'HMR', description: 'Hot module replacement.', content: () => null }],
		},
	],
};

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
