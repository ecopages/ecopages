import type { CatalogDb } from '../db/catalog-database.server.ts';
import { searchProducts } from './queries.server.ts';
import {
	firstQueryValue,
	MIN_SUGGESTION_QUERY,
	toSearchSuggestion,
	type QueryValue,
	type SearchSuggestionsResponse,
} from './search-suggestions.ts';
import type { ProductSummary } from './types.ts';

export const SUGGESTION_LIMIT = 6;

const SEARCH_PAGE_LIMIT = 60;

/** Longest query read, so a pasted essay does not become a database scan pattern. */
const MAX_QUERY_LENGTH = 80;

/** Most rows `?limit=` may ask for; the `search_catalog` agent tool offers the same bound. */
export const MAX_SUGGESTION_LIMIT = 24;

function readLimit(limit: QueryValue): number {
	const value = Number(firstQueryValue(limit));
	return Number.isInteger(value) && value >= 1 && value <= MAX_SUGGESTION_LIMIT ? value : SUGGESTION_LIMIT;
}

function normalizeQuery(query: QueryValue): string {
	return (firstQueryValue(query) ?? '').trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * `GET /api/search?q=`: the first products whose name contains the query.
 *
 * @remarks
 * The catalog only changes on regeneration, so a browser or CDN may reuse an answer for a minute.
 */
export async function searchSuggestionsAction(db: CatalogDb, query: QueryValue, limit?: QueryValue): Promise<Response> {
	const term = normalizeQuery(query);
	const products = term.length >= MIN_SUGGESTION_QUERY ? await searchProducts(db, term, readLimit(limit)) : [];
	const body: SearchSuggestionsResponse = { query: term, results: products.map(toSearchSuggestion) };
	return Response.json(body, { headers: { 'cache-control': 'public, max-age=60' } });
}

export type SearchResults = {
	/**
	 * The normalized query.
	 *
	 * @remarks
	 * Named `term` because a Page's props cannot use `query`, which `render` already receives as the URL Query.
	 */
	term: string;
	products: ProductSummary[];
	/** Whether more products match than the page lists. */
	truncated: boolean;
};

export async function getSearchResults(db: CatalogDb, query: QueryValue): Promise<SearchResults> {
	const term = normalizeQuery(query);
	if (!term) return { term, products: [], truncated: false };
	const products = await searchProducts(db, term, SEARCH_PAGE_LIMIT + 1);
	return { term, products: products.slice(0, SEARCH_PAGE_LIMIT), truncated: products.length > SEARCH_PAGE_LIMIT };
}
