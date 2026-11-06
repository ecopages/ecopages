import type { PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export function Head({ metadata, children }: PageHeadProps<string>) {
	return (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children}
		</head>
	);
}
