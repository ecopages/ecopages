import type { PageMetadataProps } from '@ecopages/core';

const withBaseUrl = (path: string) => `${import.meta.env.ECOPAGES_BASE_URL}/${path}`;

export function Seo({
	title,
	description,
	image = '/public/assets/images/default-og.webp',
	url,
	keywords,
}: PageMetadataProps) {
	return (
		<>
			<title>{title}</title>
			<link rel="icon" type="image/x-icon" href="/public/assets/favicon.svg" />
			<link rel="robots" href="/robots.txt" />
			<meta name="description" content={description} />
			{keywords?.length ? <meta name="keywords" content={keywords.join(',')} /> : null}
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta property="og:image" content={withBaseUrl(image)} />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			{url ? <link rel="canonical" href={withBaseUrl(url)} /> : null}
		</>
	);
}
