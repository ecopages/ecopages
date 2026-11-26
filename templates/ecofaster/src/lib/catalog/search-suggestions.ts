import type { ProductSummary } from './types.ts';
import { formatPrice, productImageUrl, productUrl } from './urls.ts';

/** Shortest query the typeahead looks up; one letter matches most of the catalog. */
export const MIN_SUGGESTION_QUERY = 2;

/** A `q` Query value as the request carries it: missing, once, or repeated. */
export type QueryValue = string | string[] | undefined;

export function firstQueryValue(value: QueryValue): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/** One typeahead row, as `GET /api/search` returns it. */
export type SearchSuggestion = {
	name: string;
	price: string;
	href: string;
	image: string;
};

export type SearchSuggestionsResponse = {
	query: string;
	results: SearchSuggestion[];
};

export function toSearchSuggestion(product: ProductSummary): SearchSuggestion {
	return {
		name: product.name,
		price: formatPrice(product.priceCents),
		href: productUrl(product),
		image: productImageUrl(product),
	};
}
