import type { EcoComponent } from '@ecopages/core';
import { ThemeToggle } from '@/components/theme-toggle.kita';

export type BaseLayoutProps = {
	children: string;
	className?: string;
	id?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children }) => {
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
					href="https://github.com/AmbientEarth/ecopages"
					target="_blank"
					rel="noopener noreferrer"
					class="footer-link"
				>
					GitHub
				</a>
			</footer>
		</div>
	);
};

BaseLayout.config = {
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [ThemeToggle],
	},
};
