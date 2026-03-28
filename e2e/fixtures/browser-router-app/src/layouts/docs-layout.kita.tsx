import type { EcoComponent } from '@ecopages/core';

export type DocsLayoutProps = {
	children: string;
};

const sidebarItems = [
	{ href: '/docs', label: 'Introduction' },
	{ href: '/docs/getting-started', label: 'Getting Started' },
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

export const DocsLayout: EcoComponent<DocsLayoutProps> = ({ children }) => {
	return (
		<div class="docs-layout" data-testid="docs-layout">
			<fixture-docs-sidebar
				id="docs-sidebar"
				class="docs-sidebar"
				data-eco-persist="docs-sidebar"
				data-testid="docs-sidebar"
			>
				<nav aria-label="Fixture docs navigation">
					<ul data-testid="docs-sidebar-list">
						{sidebarItems.map((item) => (
							<li>
								<a href={item.href} data-nav-link data-testid={`docs-nav-link:${item.href}`}>
									{item.label}
								</a>
							</li>
						))}
					</ul>
				</nav>
			</fixture-docs-sidebar>
			<main class="docs-content">{children as 'safe'}</main>
		</div>
	);
};

DocsLayout.config = {
	dependencies: {
		stylesheets: ['./docs.css'],
		scripts: ['./base-layout.script.ts', './docs-layout.script.ts'],
	},
};
