import type { EcoComponent, PageHeadProps } from '@ecopages/core';
import type { JSX } from 'react';
import { Seo } from '@/includes/seo';

export const Head: EcoComponent<PageHeadProps, JSX.Element> = ({ metadata, children }) => {
	return (
		<head>
			<meta charSet="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children}
		</head>
	);
};

Head.config = {
	dependencies: {
		stylesheets: ['../styles/tailwind.css'],
	},
};
