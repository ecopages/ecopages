import { addBaseUrlToPathname, type PageMetadataProps } from '@ecopages/core';

export function Seo({ title, description, image = '/public/assets/favicon.svg', url, keywords }: PageMetadataProps) {
	return (
		<>
			<title>{title}</title>
			<link rel="icon" type="image/svg+xml" href="/public/assets/favicon.svg" />
			<meta name="description" content={description} />
			{keywords?.length ? <meta name="keywords" content={keywords.join(',')} /> : null}
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta property="og:image" content={addBaseUrlToPathname(image)} />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			{url ? <link rel="canonical" href={addBaseUrlToPathname(url)} /> : null}
		</>
	);
}
