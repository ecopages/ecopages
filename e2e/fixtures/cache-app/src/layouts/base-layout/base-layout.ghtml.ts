import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export type BaseLayoutProps = {
	children: string;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
	},
	render: ({ children, class: className }) => {
		return html`
			<body>
				<main class="${className}">!${children}</main>
			</body>
		`;
	},
});
