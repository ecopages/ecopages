import { eco, type PageHeadProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { Seo } from '@/includes/seo.ghtml';

export const Head = eco.component<PageHeadProps>({
	dependencies: {
		stylesheets: ['../styles/tailwind.css', '../styles/alpine.css'],
	},

	render: ({ metadata, children }) => {
		return html`<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			!${Seo(metadata)} !${children}
		</head>`;
	},
});
