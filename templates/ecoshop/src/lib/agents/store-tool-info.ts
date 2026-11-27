/**
 * What each store tool says about itself: its name, title, description, annotations and surfaces, without its input
 * schema.
 *
 * @remarks
 * The Radiant hosts that register the page tools with WebMCP import this module, so it holds no schema and imports
 * none: a browser without `document.modelContext` never downloads the schema library. `store-tool-definitions.ts`
 * adds each tool's input schema to these and is the module the server reads; the hosts reach it only through
 * `import()` in `agentToolConfig` (`agent-tool-config.ts`), once a tool registers.
 *
 * @module
 */

/**
 * Where a tool runs. `page` is WebMCP in the shopper's browser, acting on the shopper's cart through
 * `/api/agent-tools`; `mcp` is the `/mcp` server, where a cart is named by its id.
 */
export type ToolSurface = 'page' | 'mcp';

/**
 * What a tool says about itself to an agent. The first three are WebMCP annotations; `idempotentHint` and
 * `destructiveHint` are MCP annotations that `/mcp` sends.
 */
export interface StoreToolAnnotations {
	readOnlyHint?: boolean;
	consequentialHint?: boolean;
	untrustedContentHint?: boolean;
	idempotentHint?: boolean;
	destructiveHint?: boolean;
}

export interface StoreToolInfo {
	name: string;
	title: string;
	description: string;
	annotations: StoreToolAnnotations;
	surfaces: ToolSurface[];
	/** Its only change is opening a page, which `/mcp` never does, so there it is read-only. */
	readOnlyOverMcp?: true;
}

/**
 * Keeps the tool's name as a literal type, which `agentToolConfig` uses to find the tool's schema.
 */
function defineInfo<const Name extends string>(info: StoreToolInfo & { name: Name }): StoreToolInfo & { name: Name } {
	return info;
}

export const searchCatalogInfo = defineInfo({
	name: 'search_catalog',
	title: 'Search the catalog',
	description:
		'Search the store for products, collections and pages by keywords. Each product carries variant_id, its first available variant, which create_cart and update_cart take. Read-only: it never changes the cart.',
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const browseStoreInfo = defineInfo({
	name: 'browse_store',
	title: 'Browse collections',
	description:
		'Without a collection handle, list the store collections. With one, list its products a page at a time; "all" lists every product. Set navigate to true to also open the collection page in the browser. Does not change the cart.',
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
	readOnlyOverMcp: true,
});

export const getProductInfo = defineInfo({
	name: 'get_product',
	title: 'Get a product',
	description:
		'Read a product: description, options, variants with their ids, prices and availability. Defaults to the product of the current page. Pass selected_options to narrow the variants. Set navigate to true to also open the product page. Does not change the cart.',
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
	readOnlyOverMcp: true,
});

export const showVariantInfo = defineInfo({
	name: 'show_variant',
	title: 'Show a variant',
	description:
		'Open a product page in the browser with a variant selected: an exact variant_id, or partial selected_options, which pick the first available match. Does not change the cart; take the variant id from get_product for that.',
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page'],
});

export const getCartInfo = defineInfo({
	name: 'get_cart',
	title: 'Get the cart',
	description:
		"Read the shopper's cart: its id, its lines with their line ids, titles, variant ids and line prices, and the subtotal. On a page a long cart comes a few lines at a time: pass offset (the next_offset of the last result) to read on. update_cart starts from this result.",
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const createCartInfo = defineInfo({
	name: 'create_cart',
	title: 'Create the cart',
	description:
		"Put items in the shopper's cart while it is empty. When the cart already has items nothing changes, and the result is that cart with an error message; use update_cart then. Over /mcp every call starts a new cart.",
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

/**
 * Changes the lines it is sent and leaves the others as they are.
 *
 * @remarks
 * A page shows a long cart a few lines at a time (`get_cart` with `offset`), so an agent may know only some of its
 * lines. If an unlisted line were removed, an agent that sends the page it read would empty the rest of the cart by
 * accident. Changing only what is sent is the safer design, and removing is explicit: a quantity of 0, or
 * `cancel_cart` for all of it. It holds over `/mcp` too, so the tool means the same on both.
 */
export const updateCartInfo = defineInfo({
	name: 'update_cart',
	title: 'Update the cart',
	description:
		'Change the quantity of the listed lines: a line takes the quantity given, and 0 removes it. A line you do not list stays as it is, so a long cart can be changed a few lines at a time; cancel_cart empties it. Send line ids from the latest cart result; when the cart changed since, nothing changes and an error message explains it.',
	annotations: {
		readOnlyHint: false,
		consequentialHint: false,
		idempotentHint: true,
		destructiveHint: true,
		untrustedContentHint: true,
	},
	surfaces: ['page', 'mcp'],
});

export const cancelCartInfo = defineInfo({
	name: 'cancel_cart',
	title: 'Empty the cart',
	description: 'Remove every item from the cart in one step, for a shopper who wants to start over.',
	annotations: { readOnlyHint: false, consequentialHint: false, destructiveHint: true },
	surfaces: ['page', 'mcp'],
});

export const proceedToCheckoutInfo = defineInfo({
	name: 'proceed_to_checkout',
	title: 'Go to checkout',
	description:
		"Check the cart has items, then open the store's checkout in the browser, where the shopper pays. Over /mcp it returns the checkout URL to hand to the shopper.",
	annotations: { readOnlyHint: false, consequentialHint: false },
	surfaces: ['page', 'mcp'],
});

export const askBusinessInfo = defineInfo({
	name: 'ask_business',
	title: 'Ask the store',
	description:
		"Ask about the store's policies and services: returns and refunds, shipping, privacy, terms, contact details, or FAQ topics such as gift wrapping. One question per call, in the shopper's words. Read-only; for products and prices use search_catalog.",
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const addToCartInfo = defineInfo({
	name: 'add_to_cart',
	title: 'Add to cart',
	description:
		"Add a variant of the product on this page to the shopper's cart, on top of what the cart holds. Take the variant id from get_product. Returns the whole cart.",
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page'],
});

export const getUcpProfileInfo = defineInfo({
	name: 'get_ucp_profile',
	title: 'Get the UCP profile',
	description:
		"Read the store's Universal Commerce Protocol profile: the capabilities it supports, such as catalog and cart, and the endpoint that serves them. Offered only when the store is a connected Shopify store.",
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page'],
});
