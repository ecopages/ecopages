import { eco } from '@ecopages/core';
import type { PageHeadProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Seo } from '@/includes/seo';

export const Head = eco.component<PageHeadProps<ReactNode>, ReactNode>({
	dependencies: {
		stylesheets: ['../styles/tailwind.css'],
	},

	render: ({ metadata, children }) => {
		return (
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&amp;display=swap"
					rel="stylesheet"
				/>
				<Seo {...metadata} />
				{children}
			</head>
		);
	},
});
