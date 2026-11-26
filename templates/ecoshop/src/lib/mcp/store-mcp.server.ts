import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { formatMoney, formatPriceRange } from '@/lib/commerce/money';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import {
	type Cart,
	type CommerceProvider,
	MAX_LINE_QUANTITY,
	type Product,
	type ProductSummary,
} from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';

export interface StoreMcpOptions {
	provider: CommerceProvider;
	/** Origin for the absolute URLs the tools return. */
	origin: string;
}

const money = z.object({ amount: z.string(), currencyCode: z.string() });

const productSummaryOutput = z.object({
	handle: z.string(),
	title: z.string(),
	price: z.string().describe('Display price; "from" when variants differ'),
	priceRange: z.object({ min: money, max: money }),
	available: z.boolean(),
	url: z.string(),
});

const productOutput = productSummaryOutput.extend({
	description: z.string(),
	vendor: z.string(),
	productType: z.string(),
	tags: z.array(z.string()),
	markdownUrl: z.string(),
	options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
	variants: z.array(
		z.object({
			id: z.string().describe('Pass this id to update_cart'),
			title: z.string(),
			price: z.string(),
			available: z.boolean(),
			options: z.record(z.string(), z.string()),
		}),
	),
	images: z.array(z.string()),
});

const cartOutput = z.object({
	cart: z.object({
		id: z.string().describe('Pass this id to get_cart and to the next update_cart call'),
		checkoutUrl: z.string().describe('Give this URL to the shopper to pay; agents cannot complete checkout'),
		totalQuantity: z.number(),
		subtotal: z.string(),
		lines: z.array(
			z.object({
				variantId: z.string(),
				productTitle: z.string(),
				variantTitle: z.string(),
				quantity: z.number(),
				unitPrice: z.string(),
				total: z.string(),
				productUrl: z.string(),
			}),
		),
	}),
});

const quantity = z.number().int().min(0).max(MAX_LINE_QUANTITY);

function summaryView(product: ProductSummary, origin: string): z.infer<typeof productSummaryOutput> {
	return {
		handle: product.handle,
		title: product.title,
		price: formatPriceRange(product.priceRange),
		priceRange: product.priceRange,
		available: product.availableForSale,
		url: resolveUrl(origin, storePaths.product(product.handle)),
	};
}

function productView(product: Product, origin: string): z.infer<typeof productOutput> {
	return {
		...summaryView(product, origin),
		description: product.description,
		vendor: product.vendor,
		productType: product.productType,
		tags: product.tags,
		markdownUrl: resolveUrl(origin, storePaths.productMarkdown(product.handle)),
		options: product.options,
		variants: product.variants.map((variant) => ({
			id: variant.id,
			title: variant.title,
			price: formatMoney(variant.price),
			available: variant.availableForSale,
			options: Object.fromEntries(variant.selectedOptions.map((option) => [option.name, option.value])),
		})),
		images: product.images.map((image) => resolveUrl(origin, image.url)),
	};
}

function cartView(cart: Cart, origin: string): z.infer<typeof cartOutput> {
	return {
		cart: {
			id: cart.id,
			checkoutUrl: resolveUrl(origin, cart.checkoutUrl),
			totalQuantity: cart.totalQuantity,
			subtotal: formatMoney(cart.subtotal),
			lines: cart.lines.map((line) => ({
				variantId: line.variantId,
				productTitle: line.productTitle,
				variantTitle: line.variantTitle,
				quantity: line.quantity,
				unitPrice: formatMoney(line.unitPrice),
				total: formatMoney(line.totalPrice),
				productUrl: resolveUrl(origin, storePaths.product(line.productHandle)),
			})),
		},
	};
}

/**
 * A tool result with the data both as JSON text, for clients that read `content`, and as `structuredContent`.
 */
function result<T extends Record<string, unknown>>(data: T) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function toolError(message: string) {
	return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/**
 * Builds the store's MCP server: catalog and cart tools over the same provider the pages use.
 *
 * @remarks
 * A failed lookup is a tool error (`isError`), so the calling model sees it and can recover; the SDK turns input
 * that fails a schema and thrown provider errors, such as a sold-out variant, into tool errors too.
 */
export function createStoreMcpServer({ provider, origin }: StoreMcpOptions): McpServer {
	const server = new McpServer(
		{ name: 'ecoshop', version: '1.0.0' },
		{
			instructions:
				'Storefront tools. Find products with search_products or list_collections, read variants with get_product, then add variant ids to a cart with update_cart. Keep the cart id that update_cart returns and pass it on later calls. Checkout happens in the browser: give the shopper the checkoutUrl.',
		},
	);

	server.registerTool(
		'search_products',
		{
			title: 'Search products',
			description: 'Search the catalog by keyword. Returns matching products with price and page URL.',
			inputSchema: {
				query: z.string().trim().min(1).describe('Keywords, such as "linen shirt"'),
				limit: z.number().int().min(1).max(50).default(10),
			},
			outputSchema: { products: z.array(productSummaryOutput) },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ query, limit }) => {
			const products = await provider.searchProducts(query, { limit });
			return result({ products: products.map((product) => summaryView(product, origin)) });
		},
	);

	server.registerTool(
		'get_product',
		{
			title: 'Get product',
			description: 'Read one product by handle, with its description, options and purchasable variants.',
			inputSchema: { handle: z.string().trim().min(1).describe('The product handle, such as "field-shirt"') },
			outputSchema: productOutput.shape,
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ handle }) => {
			const product = await provider.getProduct(handle);
			if (!product) return toolError(`No product with handle "${handle}".`);
			return result(productView(product, origin));
		},
	);

	server.registerTool(
		'list_collections',
		{
			title: 'List collections',
			description: 'List the store collections with their page URLs.',
			outputSchema: {
				collections: z.array(
					z.object({ handle: z.string(), title: z.string(), description: z.string(), url: z.string() }),
				),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async () => {
			const collections = await provider.listCollections({ limit: 100 });
			return result({
				collections: collections.map((collection) => ({
					handle: collection.handle,
					title: collection.title,
					description: collection.description,
					url: resolveUrl(origin, storePaths.collection(collection.handle)),
				})),
			});
		},
	);

	server.registerTool(
		'get_cart',
		{
			title: 'Get cart',
			description: 'Read a cart by the id that update_cart returned.',
			inputSchema: { cartId: z.string().min(1) },
			outputSchema: cartOutput.shape,
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ cartId }) => {
			const cart = await provider.getCart(cartId);
			if (!cart) return toolError('Cart not found. It may have expired; start a new one with update_cart.');
			return result(cartView(cart, origin));
		},
	);

	server.registerTool(
		'update_cart',
		{
			title: 'Update cart',
			description:
				'Set the quantity of one or more variants in a cart. Quantity 0 removes the line. Without a cartId, or with an expired one, a new cart is created. Returns the cart, its id and its checkout URL.',
			inputSchema: {
				cartId: z.string().min(1).optional().describe('The id from a previous update_cart call'),
				lines: z
					.array(
						z.object({ variantId: z.string().min(1).describe('A variant id from get_product'), quantity }),
					)
					.min(1),
			},
			outputSchema: cartOutput.shape,
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		},
		async ({ cartId, lines }) => {
			const cart = await provider.setCartQuantities(cartId, lines);
			return result(cartView(cart, origin));
		},
	);

	return server;
}

/**
 * Answers one Streamable HTTP request to `/mcp` with a fresh server, so no state is kept between requests.
 *
 * @remarks
 * Stateless mode with JSON responses: every tool here answers in one step, so the transport needs no session or
 * SSE stream, and the endpoint works the same on Node, Bun and serverless hosts.
 */
export async function handleMcpRequest(request: Request, options: StoreMcpOptions): Promise<Response> {
	if (!isSameOriginRequest(request, options.origin)) {
		return Response.json(
			{ jsonrpc: '2.0', error: { code: -32000, message: 'Origin not allowed' }, id: null },
			{ status: 403 },
		);
	}

	const server = createStoreMcpServer(options);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
}
