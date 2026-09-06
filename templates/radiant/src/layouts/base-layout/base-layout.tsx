import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo/logo';
import { cx } from '@/lib/cx';
import './base-layout.css';

export type BaseLayoutProps = {
	children: JsxRenderable;
	class?: string;
	prose?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps, JsxRenderable>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, class: className, prose = false }) => {
		return (
			<body>
				<header class="site-header">
					<Logo title="Ecopages" />
					<ThemeToggle />
				</header>
				<main class={cx('layout-main', prose && 'prose', className)}>{children}</main>
			</body>
		);
	},
});
