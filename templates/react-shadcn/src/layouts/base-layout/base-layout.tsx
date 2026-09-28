import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Logo } from '@/components/logo';
import { useThemeHotkey } from '@/lib/theme';
import './base-layout.css';

export type BaseLayoutProps = {
	children: ReactNode;
	class?: string;
	id?: string;
	prose?: boolean;
};

function ThemeHotkey(): null {
	useThemeHotkey();
	return null;
}

export const BaseLayout = eco.component<BaseLayoutProps, ReactNode>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, class: className, prose = false }) => {
		return (
			<body>
				<ThemeHotkey />
				<header className="site-header">
					<Logo href="/" title="Ecopages" />
				</header>
				<main className={cn('layout-main', prose && 'prose', className)}>{children}</main>
			</body>
		);
	},
});
