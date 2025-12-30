import type { EcoComponent, PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export const Head: EcoComponent<PageHeadProps> = ({ metadata, children }) => {
	return (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children as 'safe'}
		</head>
	);
};

Head.config = {
	dependencies: {
		stylesheets: ['../styles/fonts.css', '../styles/tailwind.css'],
	},
};
