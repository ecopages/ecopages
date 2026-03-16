export type PrimaryLink = {
	href: string;
	label: string;
};

export function getPrimaryLinkTestId(href: string): string {
	const normalized = href
		.replace(/^\//, '')
		.replace(/\//g, '-')
		.replace(/[^a-zA-Z0-9-]/g, '-');
	return `primary-link-${normalized || 'home'}`;
}

export function getRouteLinkTestId(href: string): string {
	const normalized = href
		.replace(/^\//, '')
		.replace(/\//g, '-')
		.replace(/[^a-zA-Z0-9-]/g, '-');
	return `route-link-${normalized || 'home'}`;
}

export const kitchenSinkShell = {
	eyebrow: 'Kitchen sink',
	title: 'Render layers, routes, middleware, and APIs in one app',
	footerLead: 'File-system pages and explicit handlers share the same shell, layout, and dependency pipeline.',
	footerTrail: 'Send the x-kitchen-role: admin header to unlock the admin group endpoints.',
} as const;

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
	{ href: '/react-server-files', label: 'Server tree' },
	{ href: '/react-server-metadata', label: 'Server metadata' },
	{ href: '/postcss', label: 'PostCSS test' },
];
