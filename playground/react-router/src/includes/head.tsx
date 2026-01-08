import type { EcoComponent, PageHeadProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Seo } from '@/includes/seo';

/**
 * @todo https://react.dev/blog/2024/04/25/react-19#support-for-preloading-resources
 */
export const Head: EcoComponent<PageHeadProps<ReactNode>, ReactNode> = ({ metadata, children }) => {
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
