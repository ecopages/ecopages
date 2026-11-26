import type { PageMetadataProps } from '@ecopages/core';
import { absoluteUrl } from '@/lib/site-origin';

export function Seo({ title, description, url, keywords }: PageMetadataProps) {
	return (
		<>
			<title>{title}</title>
			<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
			<meta name="description" content={description} />
			{keywords?.length ? <meta name="keywords" content={keywords.join(',')} /> : null}
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			{url ? <link rel="canonical" href={absoluteUrl(url)} /> : null}
		</>
	);
}
