import { HttpError } from '@ecopages/core/errors';
import { prefersMarkdown } from './negotiate';
import { markdownResponse } from './respond';

export type MarkdownTarget = {
	slug: string;
	/** True when the client asked for markdown via `.md` suffix (always serve MD). */
	forceMarkdown: boolean;
};

export type GetMarkdown = (slug: string) => Promise<string | null>;

export type MarkdownNegotiation = {
	match: (pathname: string) => MarkdownTarget | null;
	getMarkdown: GetMarkdown;
};

/**
 * Serves markdown when `match` recognizes the path and either the `.md`
 * suffix, `?format=md`, or Accept negotiation asks for it.
 *
 * @returns `null` when the request should fall through to HTML page rendering.
 */
export async function tryMarkdownResponse(
	request: Request,
	negotiation: MarkdownNegotiation,
): Promise<Response | null> {
	const method = request.method.toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		return null;
	}

	const url = new URL(request.url);
	const target = negotiation.match(url.pathname);
	if (!target) {
		return null;
	}

	const wantsMarkdown = target.forceMarkdown || prefersMarkdown(request);
	if (!wantsMarkdown) {
		return null;
	}

	const body = await negotiation.getMarkdown(target.slug);
	if (body === null) {
		return HttpError.NotFound(`Unknown markdown entry: ${target.slug}`).toResponse();
	}

	return markdownResponse(body, { method });
}
