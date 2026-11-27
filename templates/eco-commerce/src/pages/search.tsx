import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ListingPagination } from '@/components/listing-pagination/listing-pagination';
import { ProductFilters } from '@/components/product-filters/product-filters';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { pageTitle } from '@/lib/store';
import { firstQueryValue, listingUrl } from '@/lib/storefront/listing-query';
import { getSearchPage, type SearchPageProps } from '@/lib/storefront/product-list.server';
import '@/components/subcategory-listing/subcategory-listing.css';

function summarize({ filters, results }: SearchPageProps): string {
	if (!filters.q && !filters.in) return 'Type a product name in the search box above.';
	if (results.total === 0) return 'Nothing matches. Try a shorter word or fewer filters.';
	return `${results.total} product${results.total === 1 ? '' : 's'}${results.pageCount > 1 ? `, page ${results.page} of ${results.pageCount}` : ''}.`;
}

/**
 * The search page, which also serves filtered and sorted listings: every filter lives in the URL Query.
 *
 * @remarks
 * It renders per request because a static or revalidating Page does not receive the Query.
 */
export default eco.page<SearchPageProps, JsxRenderable>({
	cache: 'dynamic',
	layout: {
		component: BaseLayout,
		props: ({ query }) => ({ searchQuery: firstQueryValue(query?.q) ?? '' }),
	},
	props: async ({ query }) => getSearchPage(getCommerceBackend().catalog, query),
	metadata: ({ props }) => ({
		title: pageTitle(props.filters.q ? `Search: ${props.filters.q}` : 'Search'),
		description: 'Search and filter the catalog.',
		robots: { index: false },
	}),
	render: (props) => (
		<>
			<header class="page-header">
				<h1>
					{props.filters.q
						? `Results for “${props.filters.q}”`
						: props.filters.in
							? 'Filtered products'
							: 'Search'}
				</h1>
				<p>{summarize(props)}</p>
			</header>
			<div class="listing-layout">
				<aside class="listing-layout__filters">
					{props.filters.q || props.filters.in ? (
						<ProductFilters filters={props.filters} facets={props.results.facets} />
					) : null}
				</aside>
				<div>
					<ProductGrid products={props.results.items} eagerCount={8} label="Search results" />
					<ListingPagination
						page={props.results.page}
						pageCount={props.results.pageCount}
						href={(page) => listingUrl({ ...props.filters, page })}
					/>
				</div>
			</div>
		</>
	),
});
