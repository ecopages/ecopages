import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiChip } from '@ecopages/radiant-ui/chip';
import { RuiDisclosure } from '@ecopages/radiant-ui/disclosure';
import { AddToCart } from '@/components/add-to-cart/add-to-cart';
import { ProductGallery } from '@/components/product-gallery/product-gallery';
import { StoreBreadcrumb } from '@/components/store-breadcrumb';
import { buildProductJsonLd, serializeJsonLd } from '@/lib/agents/product-json-ld';
import { CACHE_TAGS, CATALOG_REVALIDATE_SECONDS } from '@/lib/commerce/cache-tags';
import { formatMoney, formatPriceRange } from '@/lib/commerce/money';
import { getCommerce } from '@/lib/commerce/provider.server';
import type { Product, StorePolicy } from '@/lib/commerce/types';
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

type ProductPageProps = { product: Product; delivery: StorePolicy[] };

/**
 * The policy types whose first paragraph the page shows under the product form.
 */
const DELIVERY_POLICIES = new Set(['shipping_policy', 'refund_policy']);

export default eco.page<ProductPageProps, JsxRenderable>({
	layout: StoreLayout,
	cache: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
	paths: async () => {
		const products = await getCommerce().listProducts({ limit: PRERENDERED_PRODUCTS });
		return products.map((product) => ({ params: { handle: product.handle } }));
	},
	props: async ({ params }) => {
		const commerce = getCommerce();
		const [product, policies] = await Promise.all([
			commerce.getProduct(String(params.handle)),
			commerce.listPolicies(),
		]);
		if (!product) throw HttpError.NotFound('Product not found');
		return { product, delivery: policies.filter((policy) => DELIVERY_POLICIES.has(policy.type)) };
	},
	metadata: ({ props }) => ({
		title: props.product.title,
		description: props.product.description.slice(0, 160) || props.product.title,
		url: storePaths.product(props.product.handle),
		image: props.product.featuredImage?.url,
	}),
	render: ({ product, delivery }) => {
		const compareAt = compareAtPrice(product);

		return (
			<article class="product">
				<div class="product__gallery">
					<ProductGallery images={product.images} title={product.title} />
				</div>
				<div class="product__details">
					<header class="flex flex-col gap-2">
						<StoreBreadcrumb trail={[{ label: 'Shop', href: '/' }]} current={product.title} />
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
					{product.tags.length ? (
						<ul class="product__tags" aria-label="Tags">
							{product.tags.map((tag) => (
								<li>
									<RuiChip variant="muted">{tag}</RuiChip>
								</li>
							))}
						</ul>
					) : null}
					{delivery.length ? (
						<RuiDisclosure trigger="Shipping and returns" class="product__delivery">
							{delivery.map((policy) => (
								<p>
									{policy.body.split(/\n\s*\n/u)[0]}{' '}
									<a class="text-link" href={storePaths.policy(policy.handle)}>
										{policy.title}
									</a>
								</p>
							))}
						</RuiDisclosure>
					) : null}
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
