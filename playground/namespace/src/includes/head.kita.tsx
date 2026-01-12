import type { EcoComponent, PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export const Head: EcoComponent<PageHeadProps<string>, string> = ({ metadata, children }) => (
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<Seo {...metadata} />
		{children}
	</head>
);

Head.config = {
	dependencies: {
		stylesheets: ['../styles/global.css'],
	},
};
