import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
	id?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps, ReactNode>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		components: [ThemeToggle],
	},

	render: ({ children }) => {
		return (
			<div className="layout-container">
				<header className="site-header">
					<div className="header-content">
						<a href="/" className="logo">
							EcoBlog
						</a>
						<ThemeToggle />
					</div>
				</header>
				<main className="main-content">{children}</main>
				<footer className="site-footer">
					<p>{'© ' + new Date().getFullYear()} EcoBlog. Built with EcoPages.</p>
					<a
						href="https://github.com/ecopages/ecopages"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
					>
						GitHub
					</a>
				</footer>
			</div>
		);
	},
});
