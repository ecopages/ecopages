import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { ProductGrid } from '@/components/product-card/product-card';
import { CACHE_TAGS, CATALOG_REVALIDATE_SECONDS } from '@/lib/commerce/cache-tags';
import { getCommerce } from '@/lib/commerce/provider.server';
import type { CollectionWithProducts } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import { StoreLayout } from '@/layouts/store-layout/store-layout';

const PRODUCTS_PER_COLLECTION = 48;

export default eco.page<CollectionWithProducts, JsxRenderable>({
	layout: StoreLayout,
	cache: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CACHE_TAGS.products, CACHE_TAGS.collections] },
	paths: async () => {
		const collections = await getCommerce().listCollections({ limit: 100 });
		return collections.map((collection) => ({ params: { handle: collection.handle } }));
	},
	props: async ({ params }) => {
		const page = await getCommerce().getCollection(String(params.handle), { limit: PRODUCTS_PER_COLLECTION });
		if (!page) throw HttpError.NotFound('Collection not found');
		return page;
	},
	metadata: ({ props }) => ({
		title: props.collection.title,
		description: props.collection.description || `Shop the ${props.collection.title} collection.`,
		url: storePaths.collection(props.collection.handle),
	}),
	render: ({ collection, products }) => (
		<div class="flex flex-col gap-8">
			<header class="flex flex-col gap-2">
				<nav aria-label="Breadcrumb" class="text-sm text-muted">
					<a class="text-link" href="/#collections">
						Collections
					</a>
				</nav>
				<h1 class="page-title">{collection.title}</h1>
				{collection.description ? <p class="lede">{collection.description}</p> : null}
			</header>
			{products.length ? (
				<ProductGrid products={products} label={`${collection.title} products`} eagerCount={4} />
			) : (
				<p class="text-muted">This collection has no products yet.</p>
			)}
		</div>
	),
});
