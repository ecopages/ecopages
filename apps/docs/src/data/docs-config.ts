type DocPage = {
	title: string;
	slug: string;
};

type DocsGroup = {
	name: string;
	subdirectory?: string;
	pages: DocPage[];
};

type DocsSettings = {
	rootDir: string;
};

type DocsConfig = {
	settings: DocsSettings;
	documents: DocsGroup[];
};

export const docsConfig: DocsConfig = {
	settings: {
		rootDir: '/docs',
	},
	documents: [
		{
			name: 'Getting Started',
			subdirectory: 'getting-started',
			pages: [
				{ title: 'Introduction', slug: 'introduction' },
				{ title: 'Installation', slug: 'installation' },
				{ title: 'Configuration', slug: 'configuration' },
			],
		},
		{
			name: 'Core',
			subdirectory: 'core',
			pages: [
				{ title: 'Concepts', slug: 'concepts' },
				{ title: 'Components', slug: 'components' },
				{ title: 'Layouts', slug: 'layouts' },
				{ title: 'Pages', slug: 'pages' },
				{ title: 'Includes', slug: 'includes' },
				{ title: 'Server API', slug: 'server-api' },
				{ title: 'API Handlers', slug: 'api-handlers' },
			],
		},
		{
			name: 'Integrations',
			subdirectory: 'integrations',
			pages: [
				{ title: 'Kitajs', slug: 'kitajs' },
				{ title: 'React', slug: 'react' },
				{ title: 'Lit', slug: 'lit' },
				{ title: 'Mdx', slug: 'mdx' },
			],
		},
		{
			name: 'Ecosystem',
			subdirectory: 'ecosystem',
			pages: [
				{ title: 'Packages', slug: 'packages' },
				{ title: 'Browser Router', slug: 'browser-router' },
				{ title: 'PostCSS Processor', slug: 'postcss-processor' },
				{ title: 'Image Processor', slug: 'image-processor' },
			],
		},
		{
			name: 'Plugins',
			subdirectory: 'plugins',
			pages: [
				{ title: 'Overview', slug: 'overview' },
				{ title: 'Custom Processor', slug: 'custom-processor' },
				{ title: 'Custom Integration', slug: 'custom-integration' },
			],
		},
	],
};
