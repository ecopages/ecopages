import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ThemeToggle } from '@/components/theme-toggle';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [ThemeToggle],
	},

	render: ({ children, class: className }) => {
		return (
			<body>
				<header class="site-header">
					<a href="/" class="site-logo">
						<span>ecopages</span>
						<span class="site-logo__version">beta</span>
					</a>
					<ThemeToggle />
				</header>
				<main class={`layout-main prose ${className || ''}`}>{children}</main>
			</body>
		);
	},
});
