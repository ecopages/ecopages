/**
 * Maps a docs page pathname to the static markdown URL under `/docs-llm/*`.
 *
 * @remarks
 * The generator exports each page as `docs-llm/<first-segment>/<last-segment>.md`,
 * so the slug is the final pathname segment, matching nested paths of any depth.
 */
export function getDocsLlmUrlFromPathname(pathname: string): string | null {
	const segments = pathname.replace(/\/$/, '').split('/').filter(Boolean);

	if (segments[0] !== 'docs' || segments.length < 3) {
		return null;
	}

	return getDocsLlmUrl(segments[1]!, segments[segments.length - 1]!);
}

export function getDocsLlmUrl(section: string, slug: string): string {
	return `/docs-llm/${section}/${slug}.md`;
}
