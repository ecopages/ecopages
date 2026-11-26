import type { CartSummary } from '../cart/cart.ts';
import { MAX_QUANTITY } from '../cart/cart.ts';
import type { BrowseResult, ProductDetails } from '../catalog/catalog-api.ts';
import type { SearchSuggestionsResponse } from '../catalog/search-suggestions.ts';
import { validateToolInput, type ToolInputSchema } from './tool-schema.ts';

/**
 * A tool's WebMCP dictionary without `execute`, which the Radiant host that owns the tool supplies.
 *
 * @remarks
 * Names follow Shopify's storefront tools (`search_catalog`, `browse_store`, `get_product`, `get_cart`) where one
 * exists, so an agent sees familiar tools; the cart line tools are this template's own.
 */
export type CatalogToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: ToolInputSchema;
	annotations: { readOnlyHint: boolean; consequentialHint: boolean };
};

/** What a tool returns when it could not act; the agent reads `error`, which names the field at fault. */
export type ToolError = { error: string };

export type ToolDeps = {
	fetch: typeof fetch;
	signal?: AbortSignal;
};

const READ_ONLY = { readOnlyHint: true, consequentialHint: false };
const CART_CHANGE = { readOnlyHint: false, consequentialHint: false };

export const searchCatalogTool: CatalogToolDefinition = {
	name: 'search_catalog',
	title: 'Search the catalog',
	description: 'Finds products whose name contains the query. Returns names, prices and page links.',
	inputSchema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Words in the product name, such as "oak chair".',
				minLength: 2,
				maxLength: 80,
			},
			limit: { type: 'integer', description: 'Most products to return. Default 6.', minimum: 1, maximum: 24 },
		},
		required: ['query'],
		additionalProperties: false,
	},
	annotations: READ_ONLY,
};

export const browseStoreTool: CatalogToolDefinition = {
	name: 'browse_store',
	title: 'Browse the store',
	description:
		"Lists one level of the catalog: the collections, a collection's categories, or a category's subcategories with products. Without input it lists the place the visitor is looking at.",
	inputSchema: {
		type: 'object',
		properties: {
			collection: {
				type: 'string',
				description: 'Collection slug, such as "living".',
				minLength: 1,
				maxLength: 80,
			},
			category: {
				type: 'string',
				description: 'Category slug within the collection, such as "seating".',
				minLength: 1,
				maxLength: 80,
			},
		},
		required: [],
		additionalProperties: false,
	},
	annotations: READ_ONLY,
};

export const getProductTool: CatalogToolDefinition = {
	name: 'get_product',
	title: 'Get a product',
	description:
		"Returns a product's details by its slug. With open set to true, also shows the product page to the visitor.",
	inputSchema: {
		type: 'object',
		properties: {
			product: {
				type: 'string',
				description: 'Product slug, as search_catalog or browse_store return it.',
				minLength: 1,
				maxLength: 120,
			},
			open: { type: 'boolean', description: 'Show the product page to the visitor. Default false.' },
		},
		required: ['product'],
		additionalProperties: false,
	},
	annotations: READ_ONLY,
};

export const getCartTool: CatalogToolDefinition = {
	name: 'get_cart',
	title: 'Read the cart',
	description: "Returns the visitor's cart: each line's product, quantity and subtotal, and the total.",
	inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
	annotations: READ_ONLY,
};

const quantity = (description: string) =>
	({ type: 'integer', description, minimum: 1, maximum: MAX_QUANTITY }) as const;

export const addToCartTool: CatalogToolDefinition = {
	name: 'add_to_cart',
	title: 'Add this product to the cart',
	description: "Adds the product on this page to the visitor's cart. Returns the cart.",
	inputSchema: {
		type: 'object',
		properties: { quantity: quantity('Units to add. Default 1.') },
		required: [],
		additionalProperties: false,
	},
	annotations: CART_CHANGE,
};

const productId = {
	type: 'integer',
	description: "The line's productId, as get_cart returns it.",
	minimum: 1,
	maximum: Number.MAX_SAFE_INTEGER,
} as const;

export const updateCartLineTool: CatalogToolDefinition = {
	name: 'update_cart_line',
	title: "Change a cart line's quantity",
	description: 'Sets the quantity of a product already in the cart. Returns the cart.',
	inputSchema: {
		type: 'object',
		properties: { productId, quantity: quantity('The new quantity.') },
		required: ['productId', 'quantity'],
		additionalProperties: false,
	},
	annotations: CART_CHANGE,
};

export const removeCartLineTool: CatalogToolDefinition = {
	name: 'remove_cart_line',
	title: 'Remove a cart line',
	description: 'Removes a product from the cart. Returns the cart.',
	inputSchema: {
		type: 'object',
		properties: { productId },
		required: ['productId'],
		additionalProperties: false,
	},
	annotations: CART_CHANGE,
};

async function readJson<T>(response: Response): Promise<T | ToolError> {
	const body = (await response.json().catch(() => null)) as (T & Partial<ToolError>) | null;
	if (!response.ok)
		return { error: typeof body?.error === 'string' ? body.error : `The store answered ${response.status}.` };
	return body ?? { error: 'The store sent an unreadable answer.' };
}

function getJson<T>(url: string, deps: ToolDeps): Promise<T | ToolError> {
	return deps
		.fetch(url, { headers: { accept: 'application/json' }, signal: deps.signal })
		.then((response) => readJson<T>(response));
}

/** Validates the input against the tool's schema, returning the values or the error naming the field. */
export function readToolInput(tool: CatalogToolDefinition, input: unknown): Record<string, unknown> | ToolError {
	const result = validateToolInput(tool.inputSchema, input);
	return result.ok ? result.value : { error: result.error };
}

export function isToolError(value: unknown): value is ToolError {
	return typeof value === 'object' && value !== null && typeof (value as ToolError).error === 'string';
}

export async function searchCatalog(input: unknown, deps: ToolDeps): Promise<SearchSuggestionsResponse | ToolError> {
	const values = readToolInput(searchCatalogTool, input);
	if (isToolError(values)) return values;
	const url = new URLSearchParams({ q: String(values.query) });
	if (values.limit !== undefined) url.set('limit', String(values.limit));
	return getJson<SearchSuggestionsResponse>(`/api/search?${url}`, deps);
}

/** Lists a catalog level; `place` is where the visitor is, used when the input names none. */
export async function browseStore(
	input: unknown,
	place: { collection?: string; category?: string },
	deps: ToolDeps,
): Promise<BrowseResult | ToolError> {
	const values = readToolInput(browseStoreTool, input);
	if (isToolError(values)) return values;
	const named = values.collection !== undefined || values.category !== undefined;
	const target = named ? { collection: values.collection, category: values.category } : place;
	const url = new URLSearchParams();
	if (typeof target.collection === 'string') url.set('collection', target.collection);
	if (typeof target.category === 'string') url.set('category', target.category);
	return getJson<BrowseResult>(`/api/browse?${url}`, deps);
}

export async function getProduct(
	input: unknown,
	deps: ToolDeps & { navigate: (url: string) => Promise<void> },
): Promise<ProductDetails | ToolError> {
	const values = readToolInput(getProductTool, input);
	if (isToolError(values)) return values;
	const details = await getJson<ProductDetails>(`/api/products/${encodeURIComponent(String(values.product))}`, deps);
	if (!isToolError(details) && values.open === true) await deps.navigate(details.url);
	return details;
}

export async function getCart(input: unknown, deps: ToolDeps): Promise<CartSummary | ToolError> {
	const values = readToolInput(getCartTool, input);
	if (isToolError(values)) return values;
	return getJson<CartSummary>('/api/cart', deps);
}

/** Posts a cart change through the same Endpoint and form fields the page's forms use. */
export async function postCartChange(
	action: '/cart/add' | '/cart/update',
	fields: { productId: number; quantity: number },
	deps: ToolDeps,
): Promise<CartSummary | ToolError> {
	const body = new FormData();
	body.set('productId', String(fields.productId));
	body.set('quantity', String(fields.quantity));
	const response = await deps
		.fetch(action, { method: 'POST', body, headers: { accept: 'application/json' }, signal: deps.signal })
		.catch(() => null);
	return response ? readJson<CartSummary>(response) : { error: 'The store could not be reached.' };
}
