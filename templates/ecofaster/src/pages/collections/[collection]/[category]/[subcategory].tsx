import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getSubcategoryPage, listSubcategoryPaths, type SubcategoryPage } from '@/lib/catalog/queries.server';
import { categoryUrl, collectionUrl, subcategoryUrl } from '@/lib/catalog/urls';
import { getCatalogDb } from '@/lib/db/catalog-database.server';

export default eco.page<SubcategoryPage, JsxRenderable>({
	layout: BaseLayout,
	paths: async () => (await listSubcategoryPaths(await getCatalogDb())).map((params) => ({ params })),
	props: async ({ params }) => {
		const page = await getSubcategoryPage(
			await getCatalogDb(),
			String(params.collection),
			String(params.category),
			String(params.subcategory),
		);
		if (!page) throw HttpError.NotFound('No such subcategory.');
		return page;
	},
	metadata: ({ props }) => ({
		title: `${props.subcategory.name} | Ecofaster`,
		description: `${props.products.length} ${props.subcategory.name.toLowerCase()} in ${props.category.name}.`,
		url: subcategoryUrl(props.collection, props.category, props.subcategory),
	}),
	render: ({ collection, category, subcategory, products }) => (
		<>
			<Breadcrumbs
				crumbs={[
					{ label: 'Home', href: '/' },
					{ label: collection.name, href: collectionUrl(collection) },
					{ label: category.name, href: categoryUrl(collection, category) },
					{ label: subcategory.name },
				]}
			/>
			<header class="page-header">
				<h1>{subcategory.name}</h1>
				<p>{products.length} products</p>
			</header>
			<ProductGrid products={products} eagerCount={8} label={subcategory.name} />
		</>
	),
});
