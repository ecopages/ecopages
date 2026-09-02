import type { PageMetadataProps } from '@ecopages/core';
import {
	absoluteImageUrl,
	docsPageHeadLinks,
	homepageSoftwareApplicationJsonLd,
	ogTypeForPathname,
} from '@/lib/docs/site-meta';

export function Seo({ title, description, url, keywords, image }: PageMetadataProps) {
	const { canonical, markdownAlternate } = docsPageHeadLinks(url);
	const ogImage = absoluteImageUrl(image);
	const ogType = ogTypeForPathname(url);
	const jsonLd = url === '/' ? homepageSoftwareApplicationJsonLd(description) : null;

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
			<link rel="robots" href="/robots.txt" />
			<meta name="description" content={description} />
			{keywords?.length ? <meta name="keywords" content={keywords.join(',')} /> : null}
			{canonical ? <link rel="canonical" href={canonical} /> : null}
			{markdownAlternate ? <link rel="alternate" type="text/markdown" href={markdownAlternate} /> : null}
			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta property="og:type" content={ogType} />
			<meta property="og:image" content={ogImage} />
			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			<meta name="twitter:image" content={ogImage} />
			{jsonLd ? (
				<script type="application/ld+json" safe>
					{JSON.stringify(jsonLd)}
				</script>
			) : null}
		</>
	);
}
