import { formatMoney, formatPriceRange } from '@/lib/commerce/money';
import type { Product } from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';

const cell = (value: string) => value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');

/**
 * Builds the Markdown view of a product, served at `/products/<handle>.md` for agents that read text.
 */
export function buildProductMarkdown(product: Product, origin: string): string {
	const facts = [
		`Price: ${formatPriceRange(product.priceRange)}`,
		`Availability: ${product.availableForSale ? 'In stock' : 'Sold out'}`,
		product.vendor && `Brand: ${product.vendor}`,
		product.productType && `Type: ${product.productType}`,
		product.tags.length > 0 && `Tags: ${product.tags.join(', ')}`,
	].filter(Boolean);
	const variants = [
		'| Variant | Price | Availability | Variant id |',
		'| --- | --- | --- | --- |',
		...product.variants.map(
			(variant) =>
				`| ${cell(variant.title)} | ${formatMoney(variant.price)} | ${variant.availableForSale ? 'In stock' : 'Sold out'} | \`${variant.id}\` |`,
		),
	];
	const buy = [
		`Product page: ${resolveUrl(origin, storePaths.product(product.handle))}`,
		`Agents: call the MCP tool create_cart at ${resolveUrl(origin, storePaths.mcp)} with a variant id above, then proceed_to_checkout and hand the shopper the checkout URL.`,
	];

	return `${[
		`# ${product.title}`,
		facts.join('\n'),
		product.description,
		'## Variants',
		variants.join('\n'),
		'## Buy',
		buy.join('\n'),
	]
		.filter(Boolean)
		.join('\n\n')}\n`;
}
