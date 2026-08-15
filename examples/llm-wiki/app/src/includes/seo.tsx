import type { PageMetadataProps } from '@ecopages/core';
import { wikiMarkdownAlternatePath } from '@/lib/wiki/markdown';
import { LLM_WIKI_ORIGIN } from '@/lib/site-origin';

const withBaseUrl = (path: string) => {
	const normalized = path.replace(/^\//, '');
	return `${LLM_WIKI_ORIGIN}/${normalized}`;
};

function wikiSlugFromMetadataUrl(url: string): string | null {
	const pathname = url.startsWith('http') ? new URL(url).pathname : url.startsWith('/') ? url : `/${url}`;
	const match = pathname.match(/^\/wiki\/([^/]+)$/);
	if (!match || match[1].endsWith('.md')) {
		return null;
	}
	return match[1];
}

export function Seo({ title, description, url, keywords }: PageMetadataProps) {
	const wikiSlug = url ? wikiSlugFromMetadataUrl(url) : null;

	return (
		<>
			<title>{title}</title>
			<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			<meta name="description" content={description} />
			{keywords?.length ? ((<meta name="keywords" content={keywords.join(',')} />) as 'safe') : null}
			{url ? ((<link rel="canonical" href={withBaseUrl(url)} />) as 'safe') : null}
			{wikiSlug
				? ((
						<link
							rel="alternate"
							type="text/markdown"
							href={withBaseUrl(wikiMarkdownAlternatePath(wikiSlug))}
						/>
					) as 'safe')
				: null}
		</>
	);
}
