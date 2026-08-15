import { defineGet, json } from '@ecopages/core';
import { z } from 'zod';
import type { SearchDocument, SearchOptions, SearchResponse } from './engine';

/** Query schema for a search route: `?q=...&page=...&limit=...`. */
export const searchQuerySchema = z.object({
	q: z.string().trim().max(200).default(''),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Builds a ready-to-mount search API route from a search function. Plug any
 * `createSearchIndex(...).search` (or an async wrapper around one, like
 * `searchWiki`) into this to expose it as a paginated JSON endpoint at `path`.
 *
 * @remarks
 * Agent-facing. The SearchBox does not use this route — it searches
 * `/search-index.json` in the browser so `preview` still works.
 *
 * @example
 * ```ts
 * app.add(createSearchRoute("/api/search", searchWiki))
 * ```
 */
export function createSearchRoute<T extends SearchDocument, TPath extends string>(
	path: TPath,
	search: (query: string, options: SearchOptions) => SearchResponse<T> | Promise<SearchResponse<T>>,
) {
	return defineGet({
		path,
		schema: { query: searchQuerySchema },
		handler: async (ctx) =>
			json(
				await search(ctx.query.q, {
					page: ctx.query.page,
					limit: ctx.query.limit,
				}),
			),
	});
}
