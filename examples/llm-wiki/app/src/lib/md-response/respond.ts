const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

export type MarkdownResponseOptions = {
	status?: number;
	method?: string;
};

/**
 * Builds a markdown Response with `Vary: Accept` so caches keep HTML and MD
 * variants of the same URL separate.
 */
export function markdownResponse(body: string, options: MarkdownResponseOptions = {}): Response {
	const headers = {
		'Content-Type': MARKDOWN_CONTENT_TYPE,
		Vary: 'Accept',
	};

	if (options.method === 'HEAD') {
		return new Response(null, {
			status: options.status ?? 200,
			headers,
		});
	}

	return new Response(body, {
		status: options.status ?? 200,
		headers,
	});
}
