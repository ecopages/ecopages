/**
 * Maps a docs page to the generated static markdown URL used by the LLM copy action.
 */
export function getDocsLlmUrl(section: string, slug: string): string {
	return `/docs-llm/${section}/${slug}.md`;
}
