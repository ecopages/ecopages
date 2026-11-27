import { HttpError } from '@ecopages/core/errors';
import type { CatalogBackend } from '../commerce/backend.ts';
import type { ProductPage, SubcategoryDetail } from '../commerce/types.ts';
import { parseListingQuery, type ListingFilters } from './listing-query.ts';

export const LISTING_PAGE_SIZE = 24;

export type SubcategoryPageProps = {
	detail: SubcategoryDetail;
	results: ProductPage;
	/** The filter form's starting state: this subcategory, no filters. */
	filters: ListingFilters;
};

type SubcategoryParams = { collection: string; category: string; subcategory: string };

/** Loads one page of a subcategory listing; a missing subcategory or page is a 404. */
export async function loadSubcategoryPage(
	catalog: CatalogBackend,
	params: SubcategoryParams,
	page: number,
): Promise<SubcategoryPageProps> {
	const detail = await catalog.getSubcategory(params.collection, params.category, params.subcategory);
	if (!detail) throw HttpError.NotFound('No such subcategory.');
	const results = await catalog.listProducts({ subcategory: params.subcategory, page, pageSize: LISTING_PAGE_SIZE });
	if (page > Math.max(results.pageCount, 1) || results.page !== page) throw HttpError.NotFound('No such page.');
	return { detail, results, filters: parseListingQuery({ in: params.subcategory }) };
}

/** Params of the listing pages after the first, up to `pagesPerSubcategory` pages per subcategory. */
export async function listListingPagePaths(
	catalog: Pick<CatalogBackend, 'listCatalogPaths'>,
	pagesPerSubcategory: number,
): Promise<Array<SubcategoryParams & { page: string }>> {
	const { subcategories } = await catalog.listCatalogPaths();
	return subcategories.flatMap(({ productCount, ...params }) => {
		const pages = Math.min(Math.ceil(productCount / LISTING_PAGE_SIZE), pagesPerSubcategory);
		return Array.from({ length: Math.max(pages - 1, 0) }, (_, index) => ({ ...params, page: String(index + 2) }));
	});
}
