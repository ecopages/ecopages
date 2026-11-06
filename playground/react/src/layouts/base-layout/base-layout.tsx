import type { LayoutProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import './base-layout.css';

export interface BaseLayoutProps extends LayoutProps<ReactNode> {
	className?: string;
	id?: string;
}

export function BaseLayout({ children, className }: BaseLayoutProps) {
	return (
		<body>
			<main className={className}>{children}</main>
		</body>
	);
}
