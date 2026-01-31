import { eco } from '@ecopages/core';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle/theme-toggle.kita';

export type BaseLayoutProps = {
	children: JSX.Element;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [Logo, ThemeToggle],
	},

	render: ({ children, class: className }) => {
		return (
			<body>
				<header class="eco-header">
					<div class="eco-header__content">
						<Logo href="/" title="Ecopages" target="_self" />
						<div class="eco-header__spacer" />
						<ThemeToggle id="theme-toggle" label="Theme" hiddenLabel />
					</div>
				</header>
				<main class={className}>{children}</main>
			</body>
		);
	},
});
