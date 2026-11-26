import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { firstQueryValue } from '@/lib/catalog/search-suggestions';
import { getSearchResults, type SearchResults } from '@/lib/catalog/search.server';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

function summarize({ term, products, truncated }: SearchResults): string {
	if (!term) return 'Type a product name in the search box above.';
	if (truncated) return `Showing the first ${products.length} matches.`;
	return `${products.length} product${products.length === 1 ? '' : 's'} match.`;
}

export default eco.page<SearchResults, JsxRenderable>({
	cache: 'dynamic',
	layout: {
		component: BaseLayout,
		props: ({ query }) => ({ searchQuery: firstQueryValue(query?.q) ?? '' }),
	},
	props: async ({ query }) => getSearchResults(await getCatalogDb(), query.q),
	metadata: ({ props }) => ({
		title: props.term ? `Search: ${props.term} | Ecofaster` : 'Search | Ecofaster',
		description: 'Search the Ecofaster catalog.',
		robots: { index: false },
	}),
	render: (results) => (
		<>
			<header class="page-header">
				<h1>{results.term ? `Results for “${results.term}”` : 'Search'}</h1>
				<p>{summarize(results)}</p>
			</header>
			{results.products.length > 0 ? (
				<ProductGrid products={results.products} eagerCount={8} label="Search results" />
			) : results.term ? (
				<p class="empty-state">
					Nothing matches “{results.term}”. Try a shorter word, such as “chair” or “lamp”.
				</p>
			) : null}
		</>
	),
});
