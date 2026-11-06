import { eco, type EcoPagesElement, type LayoutProps } from '@ecopages/core';
import { ThemeToggle } from '@/components/theme-toggle.kita';
import './base-layout.css';

export interface BaseLayoutProps extends LayoutProps<EcoPagesElement> {
	id?: string;
}

export const BaseLayout = eco.layout<EcoPagesElement, BaseLayoutProps>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
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
