import { eco } from '@ecopages/core';
import type { EcoPagesElement, PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export const Head = eco.component<PageHeadProps<EcoPagesElement>>({
	dependencies: {
		components: [Seo],
	},
	render: ({ metadata, children }) => (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children}
		</head>
	),
});
