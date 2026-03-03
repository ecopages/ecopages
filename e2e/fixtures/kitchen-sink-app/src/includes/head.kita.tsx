import { eco } from '@ecopages/core';
import type { EcoPagesElement, PageHeadProps } from '@ecopages/core';
import { Seo } from './seo.kita';

export const Head = eco.component<PageHeadProps<EcoPagesElement>, EcoPagesElement>({
	dependencies: {
		components: [Seo],
	},
	render: ({ metadata, children }) => (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<Seo metadata={metadata} />
			{children as 'safe'}
		</head>
	),
});
