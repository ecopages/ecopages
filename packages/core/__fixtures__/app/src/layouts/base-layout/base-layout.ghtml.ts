import type { EcoComponent } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export type BaseLayoutProps = {
	children: string;
	class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
	return html`
		<body>
			<main class="${className}">!${children}</main>
		</body>
	`;
};

BaseLayout.config = {
	dependencies: {
		stylesheets: ['./base-layout.css'],
	},
};
