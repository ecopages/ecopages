import type { EcoComponent } from '@ecopages/core';
import type { JSX, ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
	id?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps, JSX.Element> = ({ children, className }) => {
	return (
		<main className={className}>
			<header className="site-header">
				<a href="/" className="site-title">
					EcoBlog
				</a>
				<ThemeToggle />
			</header>
			{children}
		</main>
	);
};

BaseLayout.config = {
	dependencies: {
		stylesheets: ['./base-layout.css'],
		components: [ThemeToggle],
	},
};
