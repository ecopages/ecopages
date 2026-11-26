import type { Product } from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';

const IN_STOCK = 'https://schema.org/InStock';
const OUT_OF_STOCK = 'https://schema.org/OutOfStock';

/**
 * Builds the schema.org `Product` for a product page, with one `AggregateOffer` over its variants.
 */
export function buildProductJsonLd(product: Product, origin: string) {
	const url = resolveUrl(origin, storePaths.product(product.handle));
	return {
		'@context': 'https://schema.org',
		'@type': 'Product',
		'@id': url,
		name: product.title,
		description: product.description,
		url,
		image: product.images.map((image) => resolveUrl(origin, image.url)),
		category: product.productType || undefined,
		brand: product.vendor ? { '@type': 'Brand', name: product.vendor } : undefined,
		offers: {
			'@type': 'AggregateOffer',
			url,
			priceCurrency: product.priceRange.min.currencyCode,
			lowPrice: product.priceRange.min.amount,
			highPrice: product.priceRange.max.amount,
			offerCount: product.variants.length,
			availability: product.availableForSale ? IN_STOCK : OUT_OF_STOCK,
		},
	};
}

/**
 * Serializes JSON-LD for an inline `<script type="application/ld+json">`.
 *
 * @remarks
 * Escapes `<` so a product text containing `</script>` or `<!--` cannot end the script element early.
 */
export function serializeJsonLd(value: unknown): string {
	return JSON.stringify(value).replace(/</gu, '\\u003c');
}
