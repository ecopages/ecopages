import type { DocsSiteContentMeta } from '@/docs-kit/content/docs-site-content.types';

/** Docs navigation and page metadata — safe to import from Node CLI scripts. */
export const docsSiteContentMeta = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			pages: [
				{
					slug: 'introduction',
					title: 'Introduction',
					description: 'Welcome to the docs starter — a minimal Ecopages docs site template.',
				},
				{
					slug: 'next-steps',
					title: 'Next steps',
					description: 'Extend the starter with more sections, pages, and MDX content.',
				},
			],
		},
	],
} satisfies DocsSiteContentMeta;
