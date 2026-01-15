import { eco } from '@ecopages/core';
import { ThemeToggle } from '@/components/theme-toggle.kita';

export type BaseLayoutProps = {
	children: JSX.Element | JSX.Element[];
	id?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [ThemeToggle],
	},

	render: ({ children }) => {
		return (
			<div class="layout-container">
				<header class="site-header">
					<div class="header-content">
						<a href="/" class="logo">
							EcoBlog
						</a>
						<ThemeToggle />
					</div>
				</header>
				<main class="main-content">{children as 'safe'}</main>
				<footer class="site-footer">
					<p>{'© ' + new Date().getFullYear()} EcoBlog. Built with EcoPages.</p>
					<a
						href="https://github.com/ecopages/ecopages"
						target="_blank"
						rel="noopener noreferrer"
						class="footer-link"
					>
						GitHub
					</a>
				</footer>
			</div>
		);
	},
});
