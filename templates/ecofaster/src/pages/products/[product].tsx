import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { AddToCart } from '@/components/add-to-cart/add-to-cart';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { resolveCatalogSize } from '@/lib/catalog/generator';
import { getProductPage, listPrebuiltProductPaths, type ProductPage } from '@/lib/catalog/queries.server';
import {
	categoryUrl,
	collectionUrl,
	formatPrice,
	productImageUrl,
	productUrl,
	subcategoryUrl,
} from '@/lib/catalog/urls';
import { getCatalogDb } from '@/lib/db/catalog-database.server';
import './product.css';

/**
 * @remarks
 * `paths` lists the first products of each subcategory (all of them in the small catalog); every other product
 * renders on its first request and is then cached like the prebuilt ones. Cached pages are regenerated in the
 * background after `revalidate` seconds, or at once when `POST /api/revalidate` invalidates the `catalog` or
 * `products` tag or the page's path.
 */
export default eco.page<ProductPage, JsxRenderable>({
	layout: BaseLayout,
	cache: { revalidate: 3600, tags: ['catalog', 'products'] },
	paths: async () => {
		const { size } = resolveCatalogSize(process.env.CATALOG_SIZE);
		const paths = await listPrebuiltProductPaths(await getCatalogDb(), size.prebuiltProductsPerSubcategory);
		return paths.map((params) => ({ params }));
	},
	props: async ({ params }) => {
		const page = await getProductPage(await getCatalogDb(), String(params.product));
		if (!page) throw HttpError.NotFound('No such product.');
		return page;
	},
	metadata: ({ props }) => ({
		title: `${props.product.name} | Ecofaster`,
		description: props.product.description,
		url: productUrl(props.product),
	}),
	render: ({ collection, category, subcategory, product, related }) => (
		<>
			<Breadcrumbs
				crumbs={[
					{ label: 'Home', href: '/' },
					{ label: collection.name, href: collectionUrl(collection) },
					{ label: category.name, href: categoryUrl(collection, category) },
					{ label: subcategory.name, href: subcategoryUrl(collection, category, subcategory) },
					{ label: product.name },
				]}
			/>
			<article class="product">
				<img
					class="product__image"
					src={productImageUrl(product)}
					alt={product.name}
					width={400}
					height={400}
					fetchpriority="high"
				/>
				<div class="product__details">
					<h1 class="product__name">{product.name}</h1>
					<p class="product__price">{formatPrice(product.priceCents)}</p>
					<p class="product__description">{product.description}</p>
					<AddToCart productId={product.id} />
				</div>
			</article>
			{related.length > 0 ? (
				<section class="catalog-section" aria-labelledby="related-heading">
					<div class="catalog-section__header">
						<h2 id="related-heading">More {subcategory.name.toLowerCase()}</h2>
						<a href={subcategoryUrl(collection, category, subcategory)} data-eco-prefetch="viewport">
							See all
						</a>
					</div>
					<ProductGrid products={related} />
				</section>
			) : null}
		</>
	),
});
