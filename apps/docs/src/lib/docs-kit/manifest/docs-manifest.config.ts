import type { DocsManifestConfig } from '@/lib/docs-kit/manifest/docs-manifest';

/**
 * Maintained semantic navigation order for docs content.
 *
 * @remarks Edit this file to reorder sections or pages. `buildDocsManifest` validates
 * each entry resolves to an existing content file under `src/content/docs/`.
 */
export const docsManifestConfig: DocsManifestConfig = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			pages: [
				{ section: 'getting-started', slug: 'introduction', title: 'Introduction' },
				{ section: 'getting-started', slug: 'installation', title: 'Installation' },
				{ section: 'getting-started', slug: 'configuration', title: 'Configuration' },
			],
		},
		{
			id: 'core',
			title: 'Core Concepts',
			pages: [
				{ section: 'core', slug: 'concepts', title: 'Concepts' },
				{ section: 'core', slug: 'architecture', title: 'Architecture' },
				{ section: 'core', slug: 'build-and-host', title: 'Build and Host' },
				{ section: 'core', slug: 'pages', title: 'Pages' },
				{ section: 'core', slug: 'routing', title: 'Routing' },
				{ section: 'core', slug: 'data-fetching', title: 'Data Fetching' },
				{ section: 'core', slug: 'request-locals', title: 'Request Locals' },
				{ section: 'core', slug: 'layouts', title: 'Layouts' },
				{ section: 'core', slug: 'components', title: 'Components' },
				{ section: 'core', slug: 'includes', title: 'Includes' },
				{ section: 'core', slug: 'hmr', title: 'HMR' },
				{ section: 'core', slug: 'plugin-lifecycle', title: 'Plugin Lifecycle' },
			],
		},
		{
			id: 'server',
			title: 'Server',
			pages: [
				{ section: 'server', slug: 'server-api', title: 'Server API' },
				{ section: 'server', slug: 'api-handlers', title: 'API Handlers' },
				{ section: 'server', slug: 'define-handlers', title: 'Define Handlers' },
				{ section: 'server', slug: 'explicit-routing', title: 'Explicit Routing' },
				{ section: 'server', slug: 'routing-patterns', title: 'Routing Patterns' },
				{ section: 'server', slug: 'websockets', title: 'WebSockets' },
				{ section: 'server', slug: 'caching', title: 'Caching' },
			],
		},
		{
			id: 'integrations',
			title: 'Integrations',
			pages: [
				{ section: 'integrations', slug: 'overview', title: 'Overview' },
				{ section: 'integrations', slug: 'kitajs', title: 'Kitajs' },
				{ section: 'integrations', slug: 'react', title: 'React' },
				{ section: 'integrations', slug: 'lit', title: 'Lit' },
				{ section: 'integrations', slug: 'mdx', title: 'Mdx' },
				{ section: 'integrations', slug: 'ecopages-jsx', title: 'Ecopages JSX' },
			],
		},
		{
			id: 'ecosystem',
			title: 'Ecosystem',
			pages: [
				{ section: 'ecosystem', slug: 'ecopages', title: 'Ecopages CLI' },
				{ section: 'ecosystem', slug: 'packages', title: 'Packages' },
				{ section: 'ecosystem', slug: 'vite-plugin', title: 'Vite Plugin' },
				{ section: 'ecosystem', slug: 'radiant', title: 'Radiant' },
				{ section: 'ecosystem', slug: 'browser-router', title: 'Browser Router' },
				{ section: 'ecosystem', slug: 'react-router', title: 'React Router' },
				{ section: 'ecosystem', slug: 'file-system', title: 'File System' },
				{ section: 'ecosystem', slug: 'postcss-processor', title: 'PostCSS Processor' },
				{ section: 'ecosystem', slug: 'image-processor', title: 'Image Processor' },
			],
		},
		{
			id: 'plugins',
			title: 'Extending',
			pages: [
				{ section: 'plugins', slug: 'overview', title: 'Overview' },
				{ section: 'plugins', slug: 'custom-processor', title: 'Custom Processor' },
				{ section: 'plugins', slug: 'custom-integration', title: 'Custom Integration' },
			],
		},
		{
			id: 'reference',
			title: 'Reference',
			pages: [
				{ section: 'reference', slug: 'eco-namespace', title: 'Eco Namespace' },
				{ section: 'reference', slug: 'cli-reference', title: 'CLI Reference' },
				{ section: 'reference', slug: 'deployment', title: 'Deployment' },
			],
		},
	],
};
