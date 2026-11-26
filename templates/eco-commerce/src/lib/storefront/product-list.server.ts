import type { CatalogBackend } from '../commerce/backend.ts';
import type { ProductPage } from '../commerce/types.ts';
import { emptyProductPage } from '../commerce/product-page.ts';
import { LIMITS } from '../limits.ts';
import {
	firstQueryValue,
	parseListingQuery,
	toProductQuery,
	type ListingFilters,
	type QueryValue,
} from './listing-query.ts';
import { productListJson } from './to-json.ts';

export type SearchPageProps = {
	filters: ListingFilters;
	results: ProductPage;
};

/** Reads `?pageSize=`; a size outside 1 to `LIMITS.maxListSize` falls back to the listing default. */
function readPageSize(value: QueryValue): number | undefined {
	const size = Number(firstQueryValue(value));
	return Number.isInteger(size) && size >= 1 && size <= LIMITS.maxListSize ? size : undefined;
}

/** What the search page renders for a URL Query. A request with no term and no scope lists nothing. */
export async function getSearchPage(
	catalog: CatalogBackend,
	query: Record<string, QueryValue>,
): Promise<SearchPageProps> {
	const filters = parseListingQuery(query);
	if (!filters.q && !filters.in) {
		return { filters, results: emptyProductPage() };
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
	const tooShort = !filters.in && filters.q.length < LIMITS.minSearchTerm;
	const page = tooShort
		? emptyProductPage()
		: await catalog.listProducts({ ...toProductQuery(filters), pageSize: readPageSize(query.pageSize) });
	return Response.json(productListJson(page, filters), { headers: { 'cache-control': 'public, max-age=60' } });
}
