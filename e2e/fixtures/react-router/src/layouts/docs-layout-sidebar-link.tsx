import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

type DocsLayoutSidebarLinkProps = {
	href: string;
	children: ReactNode;
};

export const DocsLayoutSidebarLink = eco.component<DocsLayoutSidebarLinkProps, ReactNode>({
	render: ({ href, children }) => {
		return (
			<a href={href} data-testid="docs-nav-link">
				{children}
			</a>
		);
	},
});
