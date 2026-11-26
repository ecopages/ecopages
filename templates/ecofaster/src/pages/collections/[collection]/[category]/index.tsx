import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCategoryPage, listCategoryPaths, type CategoryPage } from '@/lib/catalog/queries.server';
import { categoryUrl, collectionUrl, subcategoryUrl } from '@/lib/catalog/urls';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

export default eco.page<CategoryPage, JsxRenderable>({
	layout: BaseLayout,
	paths: async () => (await listCategoryPaths(await getCatalogDb())).map((params) => ({ params })),
	props: async ({ params }) => {
		const page = await getCategoryPage(await getCatalogDb(), String(params.collection), String(params.category));
		if (!page) throw HttpError.NotFound('No such category.');
		return page;
	},
	metadata: ({ props }) => ({
		title: `${props.category.name} | ${props.collection.name} | Ecofaster`,
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
				<section class="catalog-section" aria-labelledby={`subcategory-${subcategory.slug}`}>
					<div class="catalog-section__header">
						<h2 id={`subcategory-${subcategory.slug}`}>{subcategory.name}</h2>
						<a href={subcategoryUrl(collection, category, subcategory)} data-eco-prefetch="viewport">
							See all {subcategory.productCount}
						</a>
					</div>
					<ProductGrid products={subcategory.products} eagerCount={index === 0 ? 4 : 0} />
				</section>
			))}
		</>
	),
});
