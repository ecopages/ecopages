import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { AddToCart } from '@/components/add-to-cart/add-to-cart';
import { ProductImage } from '@/components/product-image';
import { buildProductJsonLd, serializeJsonLd } from '@/lib/agents/product-json-ld';
import { CACHE_TAGS, CATALOG_REVALIDATE_SECONDS } from '@/lib/commerce/cache-tags';
import { formatMoney, formatPriceRange } from '@/lib/commerce/money';
import { getCommerce } from '@/lib/commerce/provider.server';
import type { Product } from '@/lib/commerce/types';
import { siteOrigin } from '@/lib/site-origin';
import { storePaths } from '@/lib/store-urls';
import { StoreLayout } from '@/layouts/store-layout/store-layout';
import './product.css';

/**
 * Products rendered at build. The rest render on their first request and are cached like the others.
 */
const PRERENDERED_PRODUCTS = 48;

/**
 * The compare-at price shown struck through, when every variant has one price and the first variant's compare-at
 * price is higher.
 */
function compareAtPrice(product: Product): string | null {
	const [first] = product.variants;
	if (!first?.compareAtPrice || product.priceRange.min.amount !== product.priceRange.max.amount) return null;
	return Number(first.compareAtPrice.amount) > Number(first.price.amount) ? formatMoney(first.compareAtPrice) : null;
}

export default eco.page<{ product: Product }, JsxRenderable>({
	layout: StoreLayout,
	cache: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
	paths: async () => {
		const products = await getCommerce().listProducts({ limit: PRERENDERED_PRODUCTS });
		return products.map((product) => ({ params: { handle: product.handle } }));
	},
	props: async ({ params }) => {
		const product = await getCommerce().getProduct(String(params.handle));
		if (!product) throw HttpError.NotFound('Product not found');
		return { product };
	},
	metadata: ({ props }) => ({
		title: props.product.title,
		description: props.product.description.slice(0, 160) || props.product.title,
		url: storePaths.product(props.product.handle),
		image: props.product.featuredImage?.url,
	}),
	render: ({ product }) => {
		const [primary, ...more] = product.images;
		const compareAt = compareAtPrice(product);

		return (
			<article class="product">
				<div class="product__gallery">
					<ProductImage
						image={primary ?? null}
						alt={product.title}
						sizes="(min-width: 64rem) 36rem, 100vw"
						eager
						class="product__image"
					/>
					{more.map((image) => (
						<ProductImage
							image={image}
							alt={product.title}
							sizes="(min-width: 64rem) 36rem, 100vw"
							class="product__image"
						/>
					))}
				</div>
				<div class="product__details">
					<header class="flex flex-col gap-2">
						{product.vendor ? <p class="product__vendor">{product.vendor}</p> : null}
						<h1 class="page-title">{product.title}</h1>
						<p class="product__price">
							{formatPriceRange(product.priceRange)}
							{compareAt ? (
								<s class="product__compare-at">
									<span class="sr-only">Regular price </span>
									{compareAt}
								</s>
							) : null}
						</p>
					</header>
					<AddToCart product={product} />
					{product.description ? <p class="product__description">{product.description}</p> : null}
					<p class="product__alternate">
						<a
							class="text-link"
							href={storePaths.productMarkdown(product.handle)}
							rel="alternate"
							type="text/markdown"
							data-eco-reload
						>
							View as Markdown
						</a>
					</p>
				</div>
				<script type="application/ld+json">{serializeJsonLd(buildProductJsonLd(product, siteOrigin))}</script>
			</article>
		);
	},
});
