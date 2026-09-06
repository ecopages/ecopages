import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Logo } from '@/components/logo/logo';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
	/** When `false`, the caller owns the page chrome. */
	showHeader?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../../styles/tailwind.css', './base-layout.css'],
	},
	render: ({ children, class: className, showHeader = true }) => {
		if (!showHeader) {
			return children;
		}

		return (
			<>
				<header class="site-header">
					<Logo>Wiki</Logo>
				</header>
				<main class={className}>{children}</main>
			</>
		);
	},
});

export default BaseLayout;
