import type { EcoComponent } from '@ecopages/core';
import type { JSX, ReactNode } from 'react';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
	id?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps, JSX.Element> = ({ children, className }) => {
	return <main className={className}>{children}</main>;
};

BaseLayout.config = {
	dependencies: {
		stylesheets: ['./base-layout.css'],
	},
};
