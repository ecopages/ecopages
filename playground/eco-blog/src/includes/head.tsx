import { eco, type PageHeadProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Seo } from '@/includes/seo';
import '../styles/app.css';

export const Head = eco.component<PageHeadProps<JsxRenderable>, JsxRenderable>({
	render: ({ metadata, children }) => (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="color-scheme" content="light dark" />
			<link rel="alternate" type="application/rss+xml" title="EcoBlog" href="/feed.xml" />
			<Seo {...metadata} />
			{children}
		</head>
	),
});
