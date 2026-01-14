import type { EcoComponent, PageHeadProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { Seo } from './seo.ghtml';

export const Head: EcoComponent<PageHeadProps> = ({ metadata, children }) => {
	return html`<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		!${Seo(metadata)} !${children}
	</head>`;
};

Head.config = {
	dependencies: {
		stylesheets: ['../styles/tailwind.css'],
	},
};
