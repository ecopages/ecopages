import type { PageHeadProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Seo } from '@/includes/seo';
import '../styles/app.css';

export function Head({ metadata, children }: PageHeadProps<JsxRenderable>): JsxRenderable {
	return (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children as 'safe'}
		</head>
	);
}
