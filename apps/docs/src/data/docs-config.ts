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
			name: 'Core Concepts',
			subdirectory: 'core',
			pages: [
				{ title: 'Concepts', slug: 'concepts' },
				{ title: 'Architecture', slug: 'architecture' },
				{ title: 'Pages', slug: 'pages' },
				{ title: 'Routing', slug: 'routing' },
				{ title: 'Data Fetching', slug: 'data-fetching' },
				{ title: 'Layouts', slug: 'layouts' },
				{ title: 'Components', slug: 'components' },
				{ title: 'Includes', slug: 'includes' },
			],
		},
		{
			name: 'Server',
			subdirectory: 'server',
			pages: [
				{ title: 'Server API', slug: 'server-api' },
				{ title: 'API Handlers', slug: 'api-handlers' },
				{ title: 'Explicit Routing', slug: 'explicit-routing' },
				{ title: 'Caching', slug: 'caching' },
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
				{ title: 'React Router', slug: 'react-router' },
				{ title: 'File System', slug: 'file-system' },
				{ title: 'PostCSS Processor', slug: 'postcss-processor' },
				{ title: 'Image Processor', slug: 'image-processor' },
			],
		},
		{
			name: 'Extending',
			subdirectory: 'plugins',
			pages: [
				{ title: 'Overview', slug: 'overview' },
				{ title: 'Custom Processor', slug: 'custom-processor' },
				{ title: 'Custom Integration', slug: 'custom-integration' },
			],
		},
		{
			name: 'Reference',
			subdirectory: 'reference',
			pages: [
				{ title: 'Eco Namespace', slug: 'eco-namespace' },
				{ title: 'CLI Reference', slug: 'cli-reference' },
				{ title: 'Deployment', slug: 'deployment' },
			],
		},
	],
};
