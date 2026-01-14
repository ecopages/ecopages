import { eco } from '@ecopages/core';
import { html } from '@ecopages/core';

export type BaseLayoutProps = {
	children: string;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: { stylesheets: ['./base-layout.css'], scripts: ['./base-layout.script.ts'] },

	render: ({ children, class: className }) =>
		html`<body>
			<main class=${className}>!${children}</main>
		</body>`,
});
