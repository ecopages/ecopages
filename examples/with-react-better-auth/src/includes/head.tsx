import { eco } from '@ecopages/core';
import type { PageHeadProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Seo } from '@/includes/seo';

export const Head = eco.component<PageHeadProps, ReactNode>({
	dependencies: {
		stylesheets: ['../styles/router.css', '../styles/app.css'],
	},

	render: ({ metadata, children }) => {
		return (
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Seo {...metadata} />
				{children}
			</head>
		);
	},
});
