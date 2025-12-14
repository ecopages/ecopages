import { type EcoComponent, html, type PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.ghtml';

export const Head: EcoComponent<PageHeadProps> = ({ metadata, children }) => {
	return html`<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		!${Seo(metadata)} !${children}
	</head>`;
};

Head.config = {
	importMeta: import.meta,
	dependencies: {
		stylesheets: ['../styles/tailwind.css', '../styles/alpine.css'],
	},
};
