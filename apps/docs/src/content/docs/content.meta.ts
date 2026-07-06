import type { DocsSiteContentMeta } from '@/lib/docs-kit/content/docs-site-content.types';

import {
	coreIcon,
	ecosystemIcon,
	gettingStartedIcon,
	integrationsIcon,
	pluginsIcon,
	referenceIcon,
	serverIcon,
} from './section-icons';

/** Docs navigation and page metadata — safe to import from Node CLI scripts. */
export const docsSiteContentMeta = {
	rootDir: '/docs',
	sections: [
		{
			id: 'getting-started',
			title: 'Getting Started',
			icon: gettingStartedIcon,
			pages: [
				{
					slug: 'introduction',
					title: 'Introduction',
					description: 'Get started with Ecopages — a modern static site generator built on Bun and Node.js.',
				},
				{
					slug: 'installation',
					title: 'Installation',
					description:
						'Create a new Ecopages project by installing the core package and your chosen rendering integration.',
				},
				{
					slug: 'configuration',
					title: 'Configuration',
					description:
						'Customize your Ecopages project through eco.config.ts — integrations, processors, metadata, and watch paths.',
				},
			],
		},
		{
			id: 'core',
			title: 'Core Concepts',
			icon: coreIcon,
			pages: [
				{
					slug: 'concepts',
					title: 'Concepts',
					description: 'Learn how Ecopages core works before diving into pages, routing, and integrations.',
				},
				{
					slug: 'architecture',
					title: 'Architecture',
					description:
						'How Ecopages is structured: modular runtime hosts, app-owned services, and multiple rendering engines.',
				},
				{
					slug: 'build-and-host',
					title: 'Build and Host',
					description: 'How Ecopages separates build execution from dev and production host boundaries.',
				},
				{
					slug: 'pages',
					title: 'Pages',
					description: 'Define pages with eco.page — static paths, data fetching, metadata, and rendering.',
				},
				{
					slug: 'routing',
					title: 'Routing',
					description: 'File-based routing for pages and programmatic routing for API endpoints.',
				},
				{
					slug: 'data-fetching',
					title: 'Data Fetching',
					description: 'Fetch data at build time for static generation and at runtime through API handlers.',
				},
				{
					slug: 'request-locals',
					title: 'Request Locals',
					description:
						'Share typed per-request data such as sessions, request IDs, and feature flags across handlers.',
				},
				{
					slug: 'layouts',
					title: 'Layouts',
					description: 'Wrap pages with shared chrome using eco.layout and nested layout composition.',
				},
				{
					slug: 'components',
					title: 'Components',
					description: 'Build reusable UI with eco.component, dependencies, and framework integrations.',
				},
				{
					slug: 'includes',
					title: 'Includes',
					description: 'Define shared head and shell templates that structure every rendered page.',
				},
				{
					slug: 'hmr',
					title: 'HMR',
					description: 'Integration-aware hot module replacement for fast feedback during local development.',
				},
				{
					slug: 'plugin-lifecycle',
					title: 'Plugin Lifecycle',
					description: 'How Ecopages orders plugin hooks across config, build, and runtime phases.',
				},
			],
		},
		{
			id: 'server',
			title: 'Server',
			icon: serverIcon,
			pages: [
				{
					slug: 'server-api',
					title: 'Server API',
					description:
						'Create server endpoints and handle request/response logic with the Ecopages server API.',
				},
				{
					slug: 'api-handlers',
					title: 'API Handlers',
					description: 'Define API endpoints with typed handlers inside your Ecopages application.',
				},
				{
					slug: 'define-handlers',
					title: 'Define Handlers',
					description:
						'Use defineHandler and defineHandlers for type-safe individual and grouped API routes.',
				},
				{
					slug: 'explicit-routing',
					title: 'Explicit Routing',
					description: 'Take full control of application routes with explicit server-side routing.',
				},
				{
					slug: 'routing-patterns',
					title: 'Routing Patterns',
					description: 'Choose architectural patterns for organizing explicit server routes.',
				},
				{
					slug: 'websockets',
					title: 'WebSockets',
					description: 'Use Ecopages runtime-agnostic WebSockets on both Bun and Node.',
				},
				{
					slug: 'caching',
					title: 'Caching',
					description: 'Configure static, dynamic, and ISR caching strategies for pages and responses.',
				},
			],
		},
		{
			id: 'integrations',
			title: 'Integrations',
			icon: integrationsIcon,
			pages: [
				{
					slug: 'overview',
					title: 'Overview',
					description: 'Overview of Ecopages integrations for JSX, React, Lit, MDX, and KitaJS.',
				},
				{
					slug: 'kitajs',
					title: 'Kitajs',
					description: 'Integrate KitaJS HTML templating into Ecopages pages and components.',
				},
				{
					slug: 'react',
					title: 'React',
					description: 'Use React 19 components and SSR within the Ecopages rendering model.',
				},
				{
					slug: 'lit',
					title: 'Lit',
					description: 'Use Lit web components and reactive properties in Ecopages projects.',
				},
				{
					slug: 'mdx',
					title: 'Mdx',
					description: 'Author MDX content with Ecopages loader-based compilation and shared components.',
				},
				{
					slug: 'ecopages-jsx',
					title: 'Ecopages JSX',
					description: 'Build JSX-first routes through the Ecopages JSX integration and runtime.',
				},
			],
		},
		{
			id: 'ecosystem',
			title: 'Ecosystem',
			icon: ecosystemIcon,
			pages: [
				{
					slug: 'ecopages',
					title: 'Ecopages CLI',
					description: 'Scaffold, develop, build, and serve Ecopages apps with the ecopages CLI.',
				},
				{
					slug: 'packages',
					title: 'Packages',
					description: 'Overview of modular packages in the Ecopages ecosystem and how they fit together.',
				},
				{
					slug: 'vite-plugin',
					title: 'Vite Plugin',
					description: 'Run Ecopages alongside Vite dev server transforms and plugin ecosystem.',
				},
				{
					slug: 'radiant',
					title: 'Radiant',
					description: 'Build reactive web components with the Radiant library in Ecopages apps.',
				},
				{
					slug: 'browser-router',
					title: 'Browser Router',
					description: 'Add client-side SPA navigation to Ecopages sites with browser-router.',
				},
				{
					slug: 'react-router',
					title: 'React Router',
					description: 'Enable SPA navigation for React apps using the React Router integration.',
				},
				{
					slug: 'file-system',
					title: 'File System',
					description: 'Runtime-agnostic file system utilities optimized for Bun and Node.',
				},
				{
					slug: 'postcss-processor',
					title: 'PostCSS Processor',
					description: 'Process and transform CSS with the PostCSS processor plugin.',
				},
				{
					slug: 'image-processor',
					title: 'Image Processor',
					description: 'Optimize images at build time and render responsive EcoImage markup.',
				},
			],
		},
		{
			id: 'plugins',
			title: 'Extending',
			icon: pluginsIcon,
			pages: [
				{
					slug: 'overview',
					title: 'Overview',
					description: 'Extend Ecopages with processor and integration plugins.',
				},
				{
					slug: 'custom-processor',
					title: 'Custom Processor',
					description: 'Write processors that transform source files during the build pipeline.',
				},
				{
					slug: 'source-transforms',
					title: 'Source Transforms',
					description: 'Register filter-based module source rewrites for browser and HMR builds.',
				},
				{
					slug: 'custom-integration',
					title: 'Custom Integration',
					description: 'Add support for new templating engines and frameworks via custom integrations.',
				},
			],
		},
		{
			id: 'reference',
			title: 'Reference',
			icon: referenceIcon,
			pages: [
				{
					slug: 'eco-namespace',
					title: 'Eco Namespace',
					description: 'Reference for the eco namespace API used to define pages, components, and data.',
				},
				{
					slug: 'cli-reference',
					title: 'CLI Reference',
					description: 'Command-line reference for ecopages init, dev, build, and related commands.',
				},
				{
					slug: 'deployment',
					title: 'Deployment',
					description: 'Deploy static Ecopages sites and apps with server routes to production hosts.',
				},
			],
		},
	],
} satisfies DocsSiteContentMeta;
