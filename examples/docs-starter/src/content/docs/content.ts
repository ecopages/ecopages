import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';

import GettingStartedIntroduction from './getting-started/introduction.mdx';
import GettingStartedNextSteps from './getting-started/next-steps.mdx';

/** Docs navigation, metadata, and MDX modules — single source of truth. */
export const docsSiteContent = {
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
					content: GettingStartedIntroduction,
				},
				{
					slug: 'next-steps',
					title: 'Next steps',
					description: 'Extend the starter with more sections, pages, and MDX content.',
					content: GettingStartedNextSteps,
				},
			],
		},
	],
} satisfies DocsSiteContent;
