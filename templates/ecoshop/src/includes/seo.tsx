import type { PageMetadataProps } from '@ecopages/core';
import { absoluteUrl, siteOrigin } from '@/lib/site-origin';
import { resolveUrl } from '@/lib/store-urls';

export function Seo({ title, description, url, keywords, image }: PageMetadataProps) {
	const imageUrl = image ? resolveUrl(siteOrigin, image) : null;
	return (
		<>
			<title>{title}</title>
			<link
				rel="icon"
				type="image/svg+xml"
				href="/favicon/favicon-dark.svg"
				media="(prefers-color-scheme: light)"
			/>
			<link
				rel="icon"
				type="image/svg+xml"
				href="/favicon/favicon-light.svg"
				media="(prefers-color-scheme: dark)"
			/>
			<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
			<link rel="manifest" href="/favicon/site.webmanifest" />
			<meta name="description" content={description} />
			{keywords?.length ? <meta name="keywords" content={keywords.join(',')} /> : null}
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			{imageUrl ? <meta property="og:image" content={imageUrl} /> : null}
			<meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
			{imageUrl ? <meta name="twitter:image" content={imageUrl} /> : null}
			{url ? <link rel="canonical" href={absoluteUrl(url)} /> : null}
		</>
	);
}
