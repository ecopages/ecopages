import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
	/** When `false`, the caller owns the page chrome. */
	showHeader?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['../../styles/tailwind.css', './base-layout.css'],
	},
	render: ({ children, class: className, showHeader = true }) => {
		return (
			<body>
				{showHeader ? (
					<header class="site-header">
						<a href="/">Docs starter</a>
					</header>
				) : null}
				{showHeader ? <main class={className}>{children}</main> : children}
			</body>
		);
	},
});

export default BaseLayout;
