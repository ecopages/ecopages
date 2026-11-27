import { describe, expect, it } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import type { Product } from '@/lib/commerce/types';
import { buildLlmsTxt } from './llms-txt';
import { buildProductJsonLd, serializeJsonLd } from './product-json-ld';
import { buildProductMarkdown } from './product-markdown';

const ORIGIN = 'https://shop.test';
const provider = createDemoProvider();

async function product(handle: string): Promise<Product> {
	const found = await provider.getProduct(handle);
	if (!found) throw new Error(`Missing fixture product ${handle}`);
	return found;
}

describe('llms.txt', () => {
	it('lists the store, its collections and the MCP endpoint', async () => {
		const text = await buildLlmsTxt(provider, ORIGIN);

		expect(text).toMatch(/^# Ecoshop\n\n> Everyday goods made to last\./u);
		expect(text).toContain(`[MCP server](${ORIGIN}/mcp)`);
		expect(text).toContain(`- [Apparel](${ORIGIN}/collections/apparel): Shirts and tees`);
		expect(text).toContain(`- [Home](${ORIGIN}/collections/home)`);
		expect(text).toContain(`- [Field Shirt](${ORIGIN}/products/field-shirt.md): $68.00`);
	});
});

describe('product Markdown', () => {
	it('describes the product, its variants and how to buy it', async () => {
		const markdown = buildProductMarkdown(await product('linen-overshirt'), ORIGIN);

		expect(markdown).toMatch(/^# Linen Overshirt\n/u);
		expect(markdown).toContain('Price: $92.00');
		expect(markdown).toContain('| L | $92.00 | Sold out | `gid://ecoshop/ProductVariant/linen-overshirt-l` |');
		expect(markdown).toContain(`Product page: ${ORIGIN}/products/linen-overshirt`);
	});
});

describe('product Markdown escaping', () => {
	it('keeps a variant title with a pipe or a newline inside its table cell', async () => {
		const bottle = await product('steel-bottle');
		const odd = { ...bottle, variants: [{ ...bottle.variants[0]!, title: 'Large | Matte\nBlack' }] };

		expect(buildProductMarkdown(odd, ORIGIN)).toContain('| Large \\| Matte Black | $24.00 |');
	});
});

describe('product JSON-LD', () => {
	it('describes the product as a schema.org Product with offers', async () => {
		const jsonLd = buildProductJsonLd(await product('steel-bottle'), ORIGIN);

		expect(jsonLd).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: 'Steel Bottle',
			url: `${ORIGIN}/products/steel-bottle`,
			image: [`${ORIGIN}/demo/steel-bottle.svg`],
			brand: { '@type': 'Brand', name: 'Ecoshop Supply' },
			offers: {
				'@type': 'AggregateOffer',
				lowPrice: '24.00',
				highPrice: '29.00',
				priceCurrency: 'USD',
				offerCount: 2,
				availability: 'https://schema.org/InStock',
			},
		});
	});

	it('marks a product with no available variant as out of stock', async () => {
		const shirt = await product('field-shirt');
		const soldOut = {
			...shirt,
			availableForSale: false,
			variants: shirt.variants.map((variant) => ({ ...variant, availableForSale: false })),
		};

		expect(buildProductJsonLd(soldOut, ORIGIN).offers.availability).toBe('https://schema.org/OutOfStock');
	});
});

describe('serializeJsonLd', () => {
	it('cannot close the script element it is inlined in', () => {
		const serialized = serializeJsonLd({ name: '</script><script>alert(1)</script><!--' });

		expect(serialized).not.toContain('<');
		expect(JSON.parse(serialized)).toEqual({ name: '</script><script>alert(1)</script><!--' });
	});
});
