import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ProductGrid } from '@/components/product-card/product-card';
import { CACHE_TAGS, CATALOG_REVALIDATE_SECONDS } from '@/lib/commerce/cache-tags';
import { getCommerce } from '@/lib/commerce/provider.server';
import type { Collection, ProductSummary, StoreInfo } from '@/lib/commerce/types';
import { storePaths } from '@/lib/store-urls';
import { StoreLayout } from '@/layouts/store-layout/store-layout';
import './index.css';

type HomeProps = {
	store: StoreInfo;
	collections: Collection[];
	products: ProductSummary[];
};

export default eco.page<HomeProps, JsxRenderable>({
	layout: StoreLayout,
	cache: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CACHE_TAGS.products, CACHE_TAGS.collections] },
	props: async () => {
		const commerce = getCommerce();
		const [store, collections, products] = await Promise.all([
			commerce.getStore(),
			commerce.listCollections({ limit: 6 }),
			commerce.listProducts({ limit: 8 }),
		]);
		return { store, collections, products };
	},
	metadata: ({ props }) => ({
		title: props.store.name,
		description: props.store.description || `Shop ${props.store.name}.`,
		url: '/',
	}),
	render: ({ store, collections, products }) => (
		<div class="home">
			<section class="home-hero">
				<h1 class="page-title">{store.name}</h1>
				{store.description ? <p class="lede">{store.description}</p> : null}
			</section>

			{collections.length ? (
				<section class="home-section" id="collections" aria-labelledby="collections-title">
					<h2 class="section-title" id="collections-title">
						Collections
					</h2>
					<ul class="collection-list">
						{collections.map((collection) => (
							<li>
								<a class="collection-tile" href={storePaths.collection(collection.handle)}>
									<span class="collection-tile__title">{collection.title}</span>
									{collection.description ? (
										<span class="collection-tile__description">{collection.description}</span>
									) : null}
								</a>
							</li>
						))}
					</ul>
				</section>
			) : null}

			<section class="home-section" aria-labelledby="featured-title">
				<h2 class="section-title" id="featured-title">
					Featured
				</h2>
				<ProductGrid products={products} label="Featured products" eagerCount={4} />
			</section>
		</div>
	),
});
