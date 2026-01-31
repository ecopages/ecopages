import type { PageMetadataProps } from 'ecopages/core';

const withBaseUrl = (path: string) => `${import.meta.env.ECOPAGES_BASE_URL}/${path}`;

export function Seo({ title, description, url, keywords }: PageMetadataProps) {
	return (
		<>
			<title safe>{title}</title>
			<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
			<link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
			<link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
			<link rel="manifest" href="/favicon/site.webmanifest" />
			<link rel="robots" href="/robots.txt" />
			<meta name="description" content={description} />
			{keywords?.length ? ((<meta name="keywords" content={keywords.join(',')} />) as 'safe') : null}
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			{url ? ((<link rel="canonical" href={withBaseUrl(url)} />) as 'safe') : null}
		</>
	);
}
