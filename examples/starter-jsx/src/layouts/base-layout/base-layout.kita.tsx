import { eco } from 'ecopages/core';
import { ThemeToggle } from '../../components/theme-toggle.kita';
import pkg from '../../../../../package.json';

export type BaseLayoutProps = {
	children: JSX.Element | JSX.Element[];
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['../../styles/tailwind.css', './base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [ThemeToggle],
	},

	render: ({ children, class: className }) => {
		return (
			<body>
				<header class="site-header">
					<a href="/" class="site-logo">
						<span>ecopages</span>
						<span class="site-logo__version">{pkg.version}</span>
					</a>
					<ThemeToggle />
				</header>
				<main class={`layout-main prose ${className || ''}`}>{children}</main>
			</body>
		);
	},
});
