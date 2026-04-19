import { eco } from '@ecopages/core';
import type { PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo';
import type { JsxRenderable } from '@ecopages/jsx';

export const Head = eco.component<PageHeadProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../styles/fonts.css', '../styles/tailwind.css'],
	},

	render: ({ metadata, children }) => {
		return (
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Seo {...metadata} />
				{children as 'safe'}
			</head>
		);
	},
});
