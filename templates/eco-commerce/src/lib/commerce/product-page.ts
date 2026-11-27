import type { ProductPage } from './types.ts';

/** A listing with no products, such as a search with no term. */
export function emptyProductPage(): ProductPage {
	return { items: [], total: 0, page: 1, pageCount: 0, facets: { materials: [], finishes: [] } };
}
