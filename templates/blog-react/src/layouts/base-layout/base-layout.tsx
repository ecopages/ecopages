import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import './base-layout.css';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
	id?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps, ReactNode>({
	render: ({ children }) => {
		return (
			<div className="layout-container">
				<header className="site-header">
					<div className="header-content">
						<a href="/" className="logo">
							EcoBlog
						</a>
						<div className="header-actions">
							<a href="/rss.xml" className="nav-link">
								RSS
							</a>
							<ThemeToggle />
						</div>
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
