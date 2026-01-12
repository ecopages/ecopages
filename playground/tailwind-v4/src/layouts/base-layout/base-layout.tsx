import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../../components/ThemeToggle';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps, ReactNode>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
	},

	render: ({ children, className }) => {
		return (
			<body className="base-layout">
				<header className="fixed top-0 left-0 right-0 z-50 border-b border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-950/80 backdrop-blur-md">
					<div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
						<div className="font-bold text-xl tracking-tight">
							<span className="text-primary-600 dark:text-primary-400">Tailwind</span>
							<span className="text-surface-900 dark:text-white">v4</span>
						</div>
						<ThemeToggle />
					</div>
				</header>
				<main className={className}>{children}</main>
			</body>
		);
	},
});
