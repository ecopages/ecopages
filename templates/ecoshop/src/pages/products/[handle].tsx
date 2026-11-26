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
import type { Product } from '@/lib/commerce/types';
import { siteOrigin } from '@/lib/site-origin';
import { POLICY_HANDLES, storePaths } from '@/lib/store-urls';
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

type ProductPageProps = { product: Product };

/**
 * The policies the "Shipping and returns" panel links to, by Shopify's standard handles.
 */
const DELIVERY_POLICIES = [
	{ handle: POLICY_HANDLES.shipping, title: 'Shipping policy', summary: 'How and when your order ships.' },
	{
		handle: POLICY_HANDLES.refund,
		title: 'Returns and refunds',
		summary: 'How to return an item and get your money back.',
	},
];

export default eco.page<ProductPageProps, JsxRenderable>({
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
					<RuiDisclosure trigger="Shipping and returns" class="product__delivery">
						{DELIVERY_POLICIES.map((policy) => (
							<p>
								{policy.summary}{' '}
								<a class="text-link" href={storePaths.policy(policy.handle)}>
									{policy.title}
								</a>
							</p>
						))}
					</RuiDisclosure>
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
