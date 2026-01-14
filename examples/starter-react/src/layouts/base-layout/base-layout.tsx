import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

export type BaseLayoutProps = {
	children: ReactNode;
	class?: string;
	id?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
	},

	render: ({ children, class: className }) => {
		return (
			<body>
				<main className={className}>{children}</main>
			</body>
		);
	},
});
