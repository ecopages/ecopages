import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { CatalogTree } from '@/components/catalog-tree/catalog-tree';
import { FeaturedTabs } from '@/components/featured-tabs/featured-tabs';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import type { ProductCard, StoreTree } from '@/lib/commerce/types';
import { pageTitle } from '@/lib/store';

type HomeProps = {
	tree: StoreTree;
	newest: ProductCard[];
	onSale: ProductCard[];
};

const FEATURED_COUNT = 12;

export default eco.page<HomeProps, JsxRenderable>({
	layout: BaseLayout,
	metadata: () => ({
		title: pageTitle(),
		description: 'Every collection, category and subcategory of the store on one page, ready before you click.',
	}),
	props: async () => {
		const { catalog } = getCommerceBackend();
		const [tree, newest, onSale] = await Promise.all([
			catalog.getStoreTree(),
			catalog.listProducts({ badge: 'new', pageSize: FEATURED_COUNT }),
			catalog.listProducts({ badge: 'sale', pageSize: FEATURED_COUNT }),
		]);
		return { tree, newest: newest.items, onSale: onSale.items };
	},
	render: ({ tree, newest, onSale }) => (
		<>
			<header class="page-header">
				<h1>Everything for the home</h1>
				<p>Browse the whole store from here. Every link is a static page, prefetched before you click.</p>
			</header>
			<FeaturedTabs newest={newest} onSale={onSale} />
			{tree.map((collection, index) => (
				<CatalogTree collection={collection} showCollection eagerCount={index === 0 ? 8 : 0} />
			))}
		</>
	),
});
