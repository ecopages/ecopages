import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Logo } from '@/components/logo/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { cx } from '@/lib/cx';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
	prose?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: [{ src: './base-layout.script.ts', attributes: { 'data-eco-rerun': '' } }],
		components: [Logo, ThemeToggle],
	},

	render: ({ children, class: className, prose = false }) => {
		return (
			<body>
				<header class="site-header">
					<Logo href="/" title="Ecopages" />
					<ThemeToggle />
				</header>
				<main class={cx('layout-main', prose && 'prose', className)}>{children}</main>
			</body>
		);
	},
});
