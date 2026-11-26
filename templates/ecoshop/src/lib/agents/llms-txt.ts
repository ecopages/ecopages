import { storeToolDescriptors } from '@/lib/agents/store-tools.server';
import { formatPriceRange } from '@/lib/commerce/money';
import type { CommerceProvider } from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';

const LISTED_PRODUCTS = 100;

/**
 * Builds `/llms.txt` (https://llmstxt.org): the store, how agents can shop it, its collections and its products,
 * each product linked to its Markdown view.
 */
export async function buildLlmsTxt(provider: CommerceProvider, origin: string): Promise<string> {
	const [store, collections, products] = await Promise.all([
		provider.getStore(),
		provider.listCollections({ limit: 100 }),
		provider.listProducts({ limit: LISTED_PRODUCTS }),
	]);
	const url = (path: string) => resolveUrl(origin, path);
	const describe = (text: string) => (text ? `: ${text}` : '');

	const sections = [
		`# ${store.name}`,
		store.description ? `> ${store.description}` : '',
		[
			'## Shop with an agent',
			'',
			`- [MCP server](${url(storePaths.mcp)}): Streamable HTTP endpoint with the tools ${storeToolDescriptors(
				'mcp',
			)
				.map((tool) => tool.name)
				.join(', ')}. Checkout happens on the checkout URL the cart returns.`,
			"- WebMCP: in a browser that supports it, every page registers these tools with `document.modelContext`, plus show_variant, and add_to_cart on product pages, acting on the shopper's own cart.",
			`- [Search](${url(storePaths.search())}): add \`?q=\` with keywords for an HTML results page.`,
		].join('\n'),
		[
			'## Collections',
			'',
			...collections.map(
				(collection) =>
					`- [${collection.title}](${url(storePaths.collection(collection.handle))})${describe(collection.description)}`,
			),
		].join('\n'),
		[
			'## Products',
			'',
			...products.map(
				(product) =>
					`- [${product.title}](${url(storePaths.productMarkdown(product.handle))}): ${formatPriceRange(product.priceRange)}${product.availableForSale ? '' : ', sold out'}`,
			),
		].join('\n'),
	];

	return `${sections.filter(Boolean).join('\n\n')}\n`;
}
