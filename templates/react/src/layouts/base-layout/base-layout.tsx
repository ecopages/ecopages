import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { cx } from '@/lib/cx';
import './base-layout.css';

export type BaseLayoutProps = {
	children: ReactNode;
	class?: string;
	id?: string;
	prose?: boolean;
};

export const BaseLayout = eco.component<BaseLayoutProps, ReactNode>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, class: className, prose = false }) => {
		return (
			<body>
				<header className="site-header">
					<Logo href="/" title="Ecopages" />
					<ThemeToggle />
				</header>
				<main className={cx('layout-main', prose && 'prose', className)}>{children}</main>
			</body>
		);
	},
});
