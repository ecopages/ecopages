import type { EcoComponent } from '@ecopages/core';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
	id?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps, ReactNode> = ({ children, className }) => {
	return (
		<main className={className}>
			<header className="site-header">
				<a href="/" className="site-title">
					EcoBlog
				</a>
				<ThemeToggle />
			</header>
			{children}
			<footer className="site-footer">
				<p>{'© ' + new Date().getFullYear()} EcoBlog. Built with EcoPages.</p>
				<a href="https://github.com/AmbientEarth/ecopages" target="_blank" rel="noopener noreferrer">
					GitHub
				</a>
			</footer>
		</main>
	);
};

BaseLayout.config = {
	dependencies: {
		stylesheets: ['./base-layout.css'],
		components: [ThemeToggle],
	},
};
