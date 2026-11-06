import type { LayoutProps } from '@ecopages/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DocsLayoutBanner } from './docs-layout-banner';
import { DocsLayoutSidebarLink } from './docs-layout-sidebar-link';
import { LayoutCounter } from './layout-counter';
import './docs.css';

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

const queryClient = new QueryClient();

/** Counts browser evaluations of this module, so a test can tell one shared copy from two. */
function countDocsLayoutEvaluation() {
	if (typeof window === 'undefined') return;
	const runtimeWindow = window as Window & { __ECO_E2E_DOCS_LAYOUT_EVALUATIONS__?: number };
	runtimeWindow.__ECO_E2E_DOCS_LAYOUT_EVALUATIONS__ = (runtimeWindow.__ECO_E2E_DOCS_LAYOUT_EVALUATIONS__ ?? 0) + 1;
}

countDocsLayoutEvaluation();

export function DocsLayout({ children }: LayoutProps<ReactNode>) {
	return (
		<QueryClientProvider client={queryClient}>
			<div className="docs-layout" data-testid="docs-layout">
				<aside className="docs-sidebar" data-testid="docs-sidebar" data-eco-persist="scroll">
					<DocsLayoutBanner />
					<LayoutCounter testId="docs-layout-counter" />
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
		</QueryClientProvider>
	);
}
