/**
 * Maps a docs page pathname to the static markdown URL under `/docs-llm/*`.
 */
export function getDocsLlmUrlFromPathname(pathname: string): string | null {
	const segments = pathname.replace(/\/$/, '').split('/').filter(Boolean);

	if (segments[0] !== 'docs' || segments.length < 3) {
		return null;
	}

	const section = segments[1];
	const slug = segments[2];

	if (!section || !slug) {
		return null;
	}

	return getDocsLlmUrl(section, slug);
}

export function getDocsLlmUrl(section: string, slug: string): string {
	return `/docs-llm/${section}/${slug}.md`;
}
