import type { CatalogBackend } from '../commerce/backend.ts';
import type { ProductPage } from '../commerce/types.ts';
import { parseListingQuery, toProductQuery, type ListingFilters, type QueryValue } from './listing-query.ts';
import { productListJson } from './to-json.ts';

/** Most rows `?pageSize=` may ask for; the typeahead and the agent tools ask for a few. */
export const MAX_JSON_PAGE_SIZE = 24;

/** Shortest search term the typeahead looks up; one letter matches most of the catalog. */
export const MIN_SEARCH_TERM = 2;

export type SearchPageProps = {
	filters: ListingFilters;
	results: ProductPage;
};

function readPageSize(value: QueryValue): number | undefined {
	const size = Number(Array.isArray(value) ? value[0] : value);
	return Number.isInteger(size) && size >= 1 && size <= MAX_JSON_PAGE_SIZE ? size : undefined;
}

/** What the search page renders for a URL Query. A request with no term and no scope lists nothing. */
export async function getSearchPage(
	catalog: CatalogBackend,
	query: Record<string, QueryValue>,
): Promise<SearchPageProps> {
	const filters = parseListingQuery(query);
	if (!filters.q && !filters.in) {
		return {
			filters,
			results: { items: [], total: 0, page: 1, pageCount: 0, facets: { materials: [], finishes: [] } },
		};
	}
	return { filters, results: await catalog.listProducts(toProductQuery(filters)) };
}

/**
 * `GET /api/products`: the same listing as the search page, as JSON, with `?pageSize=` for short lists.
 *
 * @remarks
 * The typeahead and the agent tools read it. The catalog changes only on regeneration, so an answer may be
 * reused for a minute.
 */
export async function productListAction(catalog: CatalogBackend, query: Record<string, QueryValue>): Promise<Response> {
	const filters = parseListingQuery(query);
	const tooShort = !filters.in && filters.q.length < MIN_SEARCH_TERM;
	const page = tooShort
		? { items: [], total: 0, page: 1, pageCount: 0, facets: { materials: [], finishes: [] } }
		: await catalog.listProducts({ ...toProductQuery(filters), pageSize: readPageSize(query.pageSize) });
	return Response.json(productListJson(page, filters), { headers: { 'cache-control': 'public, max-age=60' } });
}
