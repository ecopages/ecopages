import type { EcoComponent, PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export const Head: EcoComponent<PageHeadProps> = ({ metadata, children }) => {
	return (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
			<link
				href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&family=Spline+Sans:wght@300..700&display=swap"
				rel="stylesheet"
			/>
			<Seo {...metadata} />
			{children as 'safe'}
		</head>
	);
};

Head.config = {
	dependencies: {
		stylesheets: ['../styles/tailwind.css'],
	},
};
