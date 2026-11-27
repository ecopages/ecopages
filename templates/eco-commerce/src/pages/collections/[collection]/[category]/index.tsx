import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import type { CategoryDetail } from '@/lib/commerce/types';
import { pageTitle } from '@/lib/store';
import { categoryUrl, collectionUrl, subcategoryUrl } from '@/lib/storefront/urls';

export default eco.page<CategoryDetail, JsxRenderable>({
	layout: {
		component: BaseLayout,
		props: ({ params }) => ({
			place: { collection: String(params?.collection ?? ''), category: String(params?.category ?? '') },
		}),
	},
	paths: async () => (await getCommerceBackend().catalog.listCatalogPaths()).categories.map((params) => ({ params })),
	props: async ({ params }) => {
		const page = await getCommerceBackend().catalog.getCategory(String(params.collection), String(params.category));
		if (!page) throw HttpError.NotFound('No such category.');
		return page;
	},
	metadata: ({ props }) => ({
		title: pageTitle(`${props.category.name} | ${props.collection.name}`),
		description: `${props.category.name} in the ${props.collection.name} collection.`,
		url: categoryUrl(props.collection, props.category),
	}),
	render: ({ collection, category, subcategories }) => (
		<>
			<Breadcrumbs
				crumbs={[
					{ label: 'Home', href: '/' },
					{ label: collection.name, href: collectionUrl(collection) },
					{ label: category.name },
				]}
			/>
			<header class="page-header">
				<h1>{category.name}</h1>
			</header>
			{subcategories.map((subcategory, index) => (
				<section class="catalog-section" aria-labelledby={`subcategory-${subcategory.handle}`}>
					<div class="catalog-section__header">
						<h2 id={`subcategory-${subcategory.handle}`}>{subcategory.name}</h2>
						<a href={subcategoryUrl(collection, category, subcategory)} data-eco-prefetch="viewport">
							See all {subcategory.productCount}
						</a>
					</div>
					<ProductGrid products={subcategory.products} eagerCount={index === 0 ? 6 : 0} />
				</section>
			))}
		</>
	),
});
