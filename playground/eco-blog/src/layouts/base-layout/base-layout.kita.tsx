import { eco, type EcoPagesElement } from '@ecopages/core';

export type BaseLayoutProps = {
	children: EcoPagesElement;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: { stylesheets: ['./base-layout.css'], scripts: ['./base-layout.script.ts'] },

	render: ({ children, class: className }) => {
		return (
			<body>
				<main class={className}>{children}</main>
			</body>
		);
	},
});
