import { defineGet } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { markdownResponse } from './respond';
import type { GetMarkdown } from './try-response';

export type MarkdownRouteOptions = {
	/** Path pattern with a `:slug` param, e.g. `/api/wiki/:slug`. */
	path: string;
	getMarkdown: GetMarkdown;
};

/**
 * Builds a ready-to-mount route that always returns markdown for `path`.
 *
 * @remarks
 * Static `preview` does not serve API routes — use `dev`/`start`, a `.md`
 * suffix, or Accept negotiation on the HTML URL instead.
 *
 * @example
 * ```ts
 * app.add(createMarkdownRoute({ path: "/api/wiki/:slug", getMarkdown }))
 * ```
 */
export function createMarkdownRoute(options: MarkdownRouteOptions) {
	return defineGet({
		path: options.path,
		handler: async (ctx) => {
			const slug = String(ctx.params.slug ?? '');
			const body = await options.getMarkdown(slug);
			if (body === null) {
				throw HttpError.NotFound(`Unknown markdown entry: ${slug}`);
			}
			return markdownResponse(body, { method: ctx.request.method });
		},
	});
}
