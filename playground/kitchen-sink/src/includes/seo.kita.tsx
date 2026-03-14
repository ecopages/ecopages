import type { PageMetadataProps } from '@ecopages/core';

const baseUrl = process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000';
const withBaseUrl = (path: string) => `${baseUrl}/${path.replace(/^\//u, '')}`;

export function Seo({ title, description, url, keywords }: PageMetadataProps) {
	return (
		<>
			<title safe>{title}</title>
			<meta name="description" content={description} />
			{keywords?.length ? ((<meta name="keywords" content={keywords.join(',')} />) as 'safe') : null}
			{url ? ((<link rel="canonical" href={withBaseUrl(url)} />) as 'safe') : null}
		</>
	);
}
