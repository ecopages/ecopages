import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { DocsLayoutSidebarLink } from './docs-layout-sidebar-link';

export type DocsLayoutProps = {
	children: ReactNode;
};

const sidebarItems = [
	{ href: '/docs', label: 'Introduction' },
	{ href: '/docs/getting-started', label: 'Getting Started' },
	{ href: '/docs/mdx-docs-1', label: 'MDX Docs 1' },
	{ href: '/docs/mdx-docs-2', label: 'MDX Docs 2' },
	{ href: '/docs/installation', label: 'Installation' },
	{ href: '/docs/configuration', label: 'Configuration' },
	{ href: '/docs/routing', label: 'Routing' },
	{ href: '/docs/layouts', label: 'Layouts' },
	{ href: '/docs/components', label: 'Components' },
	{ href: '/docs/styling', label: 'Styling' },
	{ href: '/docs/data-fetching', label: 'Data Fetching' },
	{ href: '/docs/deployment', label: 'Deployment' },
	{ href: '/docs/api-reference', label: 'API Reference' },
	{ href: '/docs/examples', label: 'Examples' },
];

export const DocsLayout = eco.layout<DocsLayoutProps, ReactNode>({
	dependencies: {
		stylesheets: ['./docs.css'],
		components: [DocsLayoutSidebarLink],
	},
	render: ({ children }) => {
		return (
			<div className="docs-layout" data-testid="docs-layout">
				<aside className="docs-sidebar" data-testid="docs-sidebar" data-eco-persist="scroll">
					<nav>
						<ul>
							{sidebarItems.map((item) => (
								<li key={item.href}>
									<DocsLayoutSidebarLink href={item.href}>{item.label}</DocsLayoutSidebarLink>
								</li>
							))}
						</ul>
					</nav>
				</aside>
				<main className="docs-content">{children}</main>
			</div>
		);
	},
});
