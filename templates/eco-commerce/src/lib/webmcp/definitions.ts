import { LIMITS } from '../limits.ts';
import { SORTS } from '../storefront/listing-query.ts';
import type { ToolInputSchema } from './tool-schema.ts';

/**
 * A tool's WebMCP dictionary without `execute`, which the Radiant host that owns the tool supplies.
 *
 * @remarks
 * Names follow Shopify's storefront tools (`search_catalog`, `browse_store`, `get_product`, `get_cart`) where one
 * exists, so an agent sees familiar tools; the others are this template's own. Every tool states what it
 * changes through `readOnlyHint` and `consequentialHint`, as the Radiant agent-tool guide asks.
 */
export type ToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: ToolInputSchema;
	annotations: { readOnlyHint: boolean; consequentialHint: boolean };
};

const READ_ONLY = { readOnlyHint: true, consequentialHint: false } as const;
const CHANGES_PAGE_OR_CART = { readOnlyHint: false, consequentialHint: false } as const;
const NO_INPUT = {
	type: 'object',
	properties: {},
	required: [],
	additionalProperties: false,
} as const satisfies ToolInputSchema;

const handle = (description: string) => ({ type: 'string', description, minLength: 1, maxLength: 120 }) as const;
const quantity = (description: string) =>
	({ type: 'integer', description, minimum: 1, maximum: LIMITS.quantity }) as const;
const variantId = {
	type: 'string',
	description: "The line's variantId, as get_cart returns it.",
	minLength: 1,
	maxLength: 64,
} as const;

export const searchCatalogTool = {
	name: 'search_catalog',
	title: 'Search the catalog',
	description: 'Finds products whose name contains the query. Returns names, prices and page links.',
	inputSchema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Words in the product name, such as "oak chair".',
				minLength: LIMITS.minSearchTerm,
				maxLength: LIMITS.maxSearchTerm,
			},
			limit: {
				type: 'integer',
				description: 'Most products to return. Default 6.',
				minimum: 1,
				maximum: LIMITS.maxListSize,
			},
		},
		required: ['query'],
		additionalProperties: false,
	},
	annotations: READ_ONLY,
} as const satisfies ToolDefinition;

export const browseStoreTool = {
	name: 'browse_store',
	title: 'Browse the store',
	description:
		"Lists one level of the catalog: the collections, a collection's categories, or a category's subcategories with products. Without input it lists the place the visitor is looking at.",
	inputSchema: {
		type: 'object',
		properties: {
			collection: handle('Collection handle, such as "living".'),
			category: handle('Category handle within the collection, such as "seating".'),
		},
		required: [],
		additionalProperties: false,
	},
	annotations: READ_ONLY,
} as const satisfies ToolDefinition;

export const getProductTool = {
	name: 'get_product',
	title: 'Get a product',
	description: "Returns a product's details and variants by its handle.",
	inputSchema: {
		type: 'object',
		properties: { product: handle('Product handle, as search_catalog or browse_store return it.') },
		required: ['product'],
		additionalProperties: false,
	},
	annotations: READ_ONLY,
} as const satisfies ToolDefinition;

export const openProductTool = {
	name: 'open_product',
	title: 'Show a product',
	description: "Shows a product's page to the visitor, by its handle, and returns the product's details.",
	inputSchema: {
		type: 'object',
		properties: { product: handle('Product handle, as search_catalog or browse_store return it.') },
		required: ['product'],
		additionalProperties: false,
	},
	annotations: CHANGES_PAGE_OR_CART,
} as const satisfies ToolDefinition;

export const getCartTool = {
	name: 'get_cart',
	title: 'Read the cart',
	description: "Returns the visitor's cart: each line's product, option, quantity and subtotal, and the total.",
	inputSchema: NO_INPUT,
	annotations: READ_ONLY,
} as const satisfies ToolDefinition;

export const openCartTool = {
	name: 'open_cart',
	title: 'Show the cart',
	description: 'Opens the cart drawer so the visitor sees the cart, and returns the cart.',
	inputSchema: NO_INPUT,
	annotations: READ_ONLY,
} as const satisfies ToolDefinition;

export const filterProductsTool = {
	name: 'filter_products',
	title: 'Filter and sort products',
	description:
		'Shows the products of this listing that match the filters, in the chosen order, and returns the first page. Omitted fields keep their current value.',
	inputSchema: {
		type: 'object',
		properties: {
			materials: {
				type: 'array',
				description: 'Materials to keep, such as ["oak"].',
				items: { type: 'string' },
				maxItems: 20,
			},
			finishes: {
				type: 'array',
				description: 'Finishes to keep, such as ["sand"].',
				items: { type: 'string' },
				maxItems: 20,
			},
			minPrice: { type: 'integer', description: 'Lowest price in dollars.', minimum: 0, maximum: 100_000 },
			maxPrice: { type: 'integer', description: 'Highest price in dollars.', minimum: 0, maximum: 100_000 },
			sort: { type: 'string', description: 'Order of the results.', enum: SORTS.map((sort) => sort.value) },
		},
		required: [],
		additionalProperties: false,
	},
	annotations: CHANGES_PAGE_OR_CART,
} as const satisfies ToolDefinition;

export const selectVariantTool = {
	name: 'select_variant',
	title: 'Choose a finish',
	description: 'Selects a finish of the product on this page, as the visitor would. Returns the selected variant.',
	inputSchema: {
		type: 'object',
		properties: {
			variant: {
				type: 'string',
				description: 'The finish name or variant id, as get_product lists them.',
				minLength: 1,
				maxLength: 64,
			},
		},
		required: ['variant'],
		additionalProperties: false,
	},
	annotations: CHANGES_PAGE_OR_CART,
} as const satisfies ToolDefinition;

export const addToCartTool = {
	name: 'add_to_cart',
	title: 'Add this product to the cart',
	description: "Adds the product on this page, in the selected finish, to the visitor's cart. Returns the cart.",
	inputSchema: {
		type: 'object',
		properties: {
			quantity: quantity('Units to add. Default 1.'),
			variant: {
				type: 'string',
				description: 'A finish name or variant id. Default: the selected finish.',
				minLength: 1,
				maxLength: 64,
			},
		},
		required: [],
		additionalProperties: false,
	},
	annotations: CHANGES_PAGE_OR_CART,
} as const satisfies ToolDefinition;

export const updateCartLineTool = {
	name: 'update_cart_line',
	title: "Change a cart line's quantity",
	description: 'Sets the quantity of a line already in the cart. Returns the cart.',
	inputSchema: {
		type: 'object',
		properties: { variantId, quantity: quantity('The new quantity.') },
		required: ['variantId', 'quantity'],
		additionalProperties: false,
	},
	annotations: CHANGES_PAGE_OR_CART,
} as const satisfies ToolDefinition;

export const removeCartLineTool = {
	name: 'remove_cart_line',
	title: 'Remove a cart line',
	description: 'Removes a line from the cart. Returns the cart.',
	inputSchema: { type: 'object', properties: { variantId }, required: ['variantId'], additionalProperties: false },
	annotations: CHANGES_PAGE_OR_CART,
} as const satisfies ToolDefinition;
