import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiBadge } from '@ecopages/radiant-ui/badge';
import { AddToCart } from '@/components/add-to-cart/add-to-cart';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductDetails } from '@/components/product-details/product-details';
import { ProductGrid } from '@/components/product-grid/product-grid';
import { RecentlyViewed } from '@/components/recently-viewed/recently-viewed';
import { BaseLayout } from '@/layouts/base-layout/base-layout';
import { getCommerceBackend } from '@/lib/commerce/index.server';
import { formatMoney } from '@/lib/commerce/money';
import type { Product, ProductCard } from '@/lib/commerce/types';
import { pageTitle } from '@/lib/store';
import { resolveBuildPolicy } from '@/lib/storefront/build-policy';
import { productJson } from '@/lib/storefront/to-json';
import { categoryUrl, collectionUrl, productUrl, subcategoryUrl } from '@/lib/storefront/urls';
import './product.css';

type ProductPageProps = {
	product: Product;
	related: ProductCard[];
};

const RELATED_COUNT = 12;

/**
 * @remarks
 * `paths` lists the first products of each subcategory, as `resolveBuildPolicy` says; every other product renders
 * on its first request and is then cached like the prebuilt ones. Cached pages are regenerated in the background
 * after `revalidate` seconds, or at once when `POST /api/revalidate` invalidates the `catalog` or `products` tag
 * or the page's path.
 */
export default eco.page<ProductPageProps, JsxRenderable>({
	layout: BaseLayout,
	cache: { revalidate: 3600, tags: ['catalog', 'products'] },
	paths: async () => {
		const handles = await getCommerceBackend().catalog.listFeaturedProductHandles(
			resolveBuildPolicy().productsPerSubcategory,
		);
		return handles.map((product) => ({ params: { product } }));
	},
	props: async ({ params }) => {
		const { catalog } = getCommerceBackend();
		const handle = String(params.product);
		const [product, related] = await Promise.all([
			catalog.getProduct(handle),
			catalog.getRelatedProducts(handle, RELATED_COUNT),
		]);
		if (!product) throw HttpError.NotFound('No such product.');
		return { product, related };
	},
	metadata: ({ props }) => ({
		title: pageTitle(props.product.title),
		description: props.product.description,
		url: productUrl(props.product),
	}),
	render: ({ product, related }) => (
		<>
			<Breadcrumbs
				crumbs={[
					{ label: 'Home', href: '/' },
					{ label: product.collection.name, href: collectionUrl(product.collection) },
					{ label: product.category.name, href: categoryUrl(product.collection, product.category) },
					{
						label: product.subcategory.name,
						href: subcategoryUrl(product.collection, product.category, product.subcategory),
					},
					{ label: product.title },
				]}
			/>
			<article class="product">
				<img
					class="product__image"
					src={product.thumbnail}
					alt={product.title}
					width={400}
					height={400}
					fetchpriority="high"
				/>
				<div class="product__details">
					{product.badge ? (
						<RuiBadge variant={product.badge === 'sale' ? 'destructive' : 'filled'} class="product__badge">
							{product.badge === 'sale' ? 'Sale' : 'New'}
						</RuiBadge>
					) : null}
					<h1 class="product__name">{product.title}</h1>
					<p class="product__price">
						{formatMoney(product.price)}
						{product.compareAtPrice ? (
							<s class="product__was">{formatMoney(product.compareAtPrice)}</s>
						) : null}
					</p>
					<AddToCart variants={product.variants} />
					<ProductDetails product={product} />
				</div>
			</article>
			{related.length > 0 ? (
				<section class="catalog-section" aria-labelledby="related-heading">
					<div class="catalog-section__header">
						<h2 id="related-heading">You may also like</h2>
						<a
							href={subcategoryUrl(product.collection, product.category, product.subcategory)}
							data-eco-prefetch="viewport"
						>
							More {product.subcategory.name.toLowerCase()}
						</a>
					</div>
					<ProductGrid products={related} />
				</section>
			) : null}
			<RecentlyViewed product={productJson(product)} />
		</>
	),
});
