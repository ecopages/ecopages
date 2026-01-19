import { eco, type PageHeadProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export const Head = eco.component<PageHeadProps>({
	dependencies: {
		stylesheets: ['../styles/tailwind.css'],
	},
	render: ({ children }) => {
		return html`<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			!${children}
		</head>`;
	},
});
