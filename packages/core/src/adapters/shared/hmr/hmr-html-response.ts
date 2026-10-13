/**
 * Returns whether a response is HTML and therefore eligible for development client
 * runtime injection.
 */
export function isHtmlResponse(response: Response): boolean {
	const contentType = response.headers.get('Content-Type');
	return contentType !== null && contentType.startsWith('text/html');
}

/**
 * Stops the browser from caching a development HTML response.
 *
 * @remarks
 * The page cache revalidates static HTML with an ETag. Development HTML is
 * sent with `no-store` so the browser loads the new document after an edit,
 * such as a changed stylesheet link from a discovered dependency.
 */
export function withUncachedDevHtml(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'no-store, must-revalidate');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
