import type { PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';
import '../styles/tailwind.css';

export function Head({ metadata, children }: PageHeadProps) {
	return (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children as 'safe'}
		</head>
	);
}
