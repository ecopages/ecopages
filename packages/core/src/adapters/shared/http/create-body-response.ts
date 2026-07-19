export type BodyResponseKind = 'json' | 'html' | 'text';

export type CreateBodyResponseInit = {
	status?: Response['status'];
	headers?: HeadersInit;
};

/**
 * Builds a typed HTTP response body for JSON, HTML, or plain text.
 *
 * @remarks
 * Sole internal emission path for adapter response helpers. Not exported from `@ecopages/core`.
 */
export function createBodyResponse(kind: BodyResponseKind, data: unknown, init?: CreateBodyResponseInit): Response {
	const headers = new Headers(init?.headers);
	const status = init?.status ?? 200;

	if (kind === 'json') {
		if (!headers.has('Content-Type')) {
			headers.set('Content-Type', 'application/json; charset=utf-8');
		}
		return new Response(JSON.stringify(data), { status, headers });
	}

	if (kind === 'html') {
		if (!headers.has('Content-Type')) {
			headers.set('Content-Type', 'text/html; charset=utf-8');
		}
		return new Response(String(data), { status, headers });
	}

	if (!headers.has('Content-Type')) {
		headers.set('Content-Type', 'text/plain; charset=utf-8');
	}
	return new Response(String(data), { status, headers });
}
