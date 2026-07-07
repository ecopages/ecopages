import { isHtmlPageResponse } from '@ecopages/core/router/link-navigation-policy';

export type FetchNavigationPageOptions = {
	bypassCache?: boolean;
	getCachedHtml?: (href: string) => string | null | undefined;
};

/**
 * Fetches HTML for a client-side navigation request.
 */
export async function fetchNavigationPage(
	url: URL,
	signal: AbortSignal,
	options: FetchNavigationPageOptions = {},
): Promise<string> {
	if (!options.bypassCache && options.getCachedHtml) {
		const cachedHtml = options.getCachedHtml(url.href);
		if (cachedHtml) {
			return cachedHtml;
		}
	}

	const response = await fetch(url.href, {
		signal,
		cache: 'no-store',
		headers: {
			Accept: 'text/html',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch page: ${response.status}`);
	}

	if (!isHtmlPageResponse(response)) {
		throw new Error(
			`Expected HTML page response, received ${response.headers.get('Content-Type') ?? 'unknown content type'}`,
		);
	}

	return response.text();
}
