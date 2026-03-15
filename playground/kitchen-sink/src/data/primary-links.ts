export type PrimaryLink = {
	href: string;
	label: string;
};

export const primaryLinks: PrimaryLink[] = [
	{ href: '/', label: 'Overview' },
	{ href: '/integration-matrix', label: 'Matrix' },
	{ href: '/integration-matrix/lit-entry', label: 'Lit entry' },
	{ href: '/integration-matrix/react-entry', label: 'React entry' },
	{ href: '/images', label: 'Images' },
	{ href: '/transitions', label: 'Transitions' },
	{ href: '/patterns/middleware', label: 'Middleware' },
	{ href: '/catalog/semantic-html', label: 'Catalog route' },
	{ href: '/explicit/team', label: 'Explicit route' },
	{ href: '/latest', label: 'ctx.render()' },
	{ href: '/api-lab', label: 'API lab' },
	{ href: '/docs', label: 'MDX' },
	{ href: '/react-content', label: 'React MDX' },
	{ href: '/react-lab', label: 'React page' },
	{ href: '/postcss', label: 'PostCSS test' },
];
