import { eco, type EcoPagesElement } from '@ecopages/core';
import { ThemeToggle } from '@/components/theme-toggle/theme-toggle.kita';
import { Logo } from '@/components/logo/logo.kita';
import { cx } from '@/lib/cx';

export type BaseLayoutProps = {
	children: EcoPagesElement;
	class?: string;
	prose?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
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
