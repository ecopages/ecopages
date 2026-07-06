import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['../../styles/tailwind.css', './base-layout.css'],
	},
	render: ({ children, class: className }) => {
		return (
			<body>
				<header class="site-header">
					<a href="/">Docs starter</a>
				</header>
				<main class={className}>{children}</main>
			</body>
		);
	},
});

export default BaseLayout;
