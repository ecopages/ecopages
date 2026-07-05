import type { DocsManifestConfig } from './docs-manifest';

export const docsManifestConfig: DocsManifestConfig = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			pages: [
				{ section: 'getting-started', slug: 'introduction', title: 'Introduction' },
				{ section: 'getting-started', slug: 'next-steps', title: 'Next steps' },
			],
		},
	],
};
