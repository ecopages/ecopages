import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ProductGrid } from '@/components/product-card/product-card';
import { SearchForm } from '@/components/search-form';
import { getCommerce } from '@/lib/commerce/provider.server';
import type { ProductSummary } from '@/lib/commerce/types';
import { StoreLayout } from '@/layouts/store-layout/store-layout';

type SearchProps = { term: string; results: ProductSummary[] };

export default eco.page<SearchProps, JsxRenderable>({
	layout: StoreLayout,
	cache: 'dynamic',
	props: async ({ query }) => {
		const raw = Array.isArray(query.q) ? query.q[0] : query.q;
		const term = (raw ?? '').trim().slice(0, 100);
		const results = term ? await getCommerce().searchProducts(term, { limit: 48 }) : [];
		return { term, results };
	},
	metadata: ({ props }) => ({
		title: props.term ? `Search: ${props.term}` : 'Search',
		description: 'Search the catalog.',
		robots: { index: false },
	}),
	render: ({ term, results }) => (
		<div class="flex flex-col gap-8">
			<header class="flex flex-col gap-4">
				<h1 class="page-title">{term ? `Results for "${term}"` : 'Search'}</h1>
				<SearchForm query={term} id="search-page-query" class="max-w-md" />
			</header>
			{term && results.length === 0 ? <p class="text-muted">No products match "{term}".</p> : null}
			{results.length ? <ProductGrid products={results} label="Search results" /> : null}
		</div>
	),
});
