import type { EcoComponent } from '@ecopages/core';
import type { JSX, ReactNode } from 'react';

export type BaseLayoutProps = {
	children: ReactNode;
	className?: string;
	id?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps, JSX.Element> = ({ children, className }) => {
	return (
		<body>
			<main className={className}>{children}</main>
		</body>
	);
};

BaseLayout.config = {
	importMeta: import.meta,
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
	},
};
