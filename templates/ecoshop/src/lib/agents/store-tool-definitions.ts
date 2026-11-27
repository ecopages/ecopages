import type { AgentToolConfig, AgentToolHost } from '@ecopages/radiant/helpers/create-agent-tool';
import * as z from 'zod/mini';
import { MAX_LINE_QUANTITY } from '@/lib/commerce/types';
import { modelContextPresent } from './model-context';

/**
 * The store's tool definitions: each tool's name, description, input schema and annotations, in one module.
 *
 * @remarks
 * The `/mcp` server, the `/api/agent-tools` Endpoint and the Radiant hosts that register the page tools with WebMCP
 * all read these, so the three cannot disagree about what a tool is called or what it takes. The module carries no
 * server code and no `run`, so the browser bundles it: the host that owns a tool decorates its method with
 * {@link agentToolConfig} of the definition. What a tool does lives in `store-tools.server.ts`.
 *
 * The schemas use `zod/mini`, whose functions a bundler can drop one by one, so the browser carries the few it uses
 * instead of the whole classic API: the Zod chunk of a built store is 14 kB gzipped, against 26 kB with classic Zod.
 * A host cannot defer it: `@agentTool` reads `inputSchema` and `parse` when the element is constructed, before a
 * dynamic import could resolve, so the chunk loads with the page whether or not the browser has WebMCP.
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

export interface StoreToolSpec<Input extends z.ZodMiniObject = z.ZodMiniObject> {
	name: string;
	title: string;
	description: string;
	input: Input;
	annotations: StoreToolAnnotations;
	surfaces: ToolSurface[];
	/** Its only change is opening a page, which `/mcp` never does, so there it is read-only. */
	readOnlyOverMcp?: true;
}

/**
 * The typed input of a tool, which is what its Radiant host's method receives from the UI and from an agent.
 */
export type ToolInput<Tool extends StoreToolSpec> = z.output<Tool['input']>;

function defineSpec<Input extends z.ZodMiniObject>(spec: StoreToolSpec<Input>): StoreToolSpec<Input> {
	return spec;
}

const MAX_LINE_ITEMS = 100;

/* Schemas shared by several tools. */

const selectedOption = z.object({
	name: z.string().check(z.describe('Option name, such as "Size".')),
	value: z.string().check(z.describe('Option value, such as "M".')),
});

const lineItem = z.object({
	item: z.object({
		id: z
			.string()
			.check(
				z.minLength(1),
				z.describe('ProductVariant id: variant_id from search, variants[].id from get_product.'),
			),
	}),
	quantity: z
		.int()
		.check(z.minimum(1), z.maximum(MAX_LINE_QUANTITY), z.describe('How many of this item the line holds.')),
});

const cartIdField = z.optional(
	z
		.string()
		.check(
			z.minLength(1),
			z.describe("On a store page, compared with the shopper's cart. Over /mcp, the cart to act on."),
		),
);

/* The tools. */

export const searchCatalogTool = defineSpec({
	name: 'search_catalog',
	title: 'Search the catalog',
	description:
		'Search the store for products, collections and pages by keywords. Each product carries variant_id, its first available variant, which create_cart and update_cart take. Read-only: it never changes the cart.',
	input: z.object({
		catalog: z.object({
			query: z.string().check(z.trim(), z.minLength(1), z.maxLength(200), z.describe('Search keywords.')),
			pagination: z.optional(
				z.object({
					limit: z._default(
						z.int().check(z.minimum(1), z.maximum(10), z.describe('Results per type, 1 to 10.')),
						5,
					),
				}),
			),
		}),
	}),
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const browseStoreTool = defineSpec({
	name: 'browse_store',
	title: 'Browse collections',
	description:
		'Without a collection handle, list the store collections. With one, list its products a page at a time; "all" lists every product. Set navigate to true to also open the collection page in the browser. Does not change the cart.',
	input: z.object({
		collection: z.optional(
			z.string().check(z.minLength(1), z.describe('Collection handle, or "all". Omit to list collections.')),
		),
		navigate: z.optional(
			z.boolean().check(z.describe('Open the collection page in the browser. Needs a collection handle.')),
		),
		sort_by: z.optional(
			z
				.enum(['best-selling', 'price-ascending', 'price-descending', 'title-ascending', 'title-descending'])
				.check(z.describe('Sort order; best-selling by default.')),
		),
		page: z.optional(z.int().check(z.minimum(1), z.describe('Page number, from 1.'))),
	}),
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
	readOnlyOverMcp: true,
});

export const getProductTool = defineSpec({
	name: 'get_product',
	title: 'Get a product',
	description:
		'Read a product: description, options, variants with their ids, prices and availability. Defaults to the product of the current page. Pass selected_options to narrow the variants. Set navigate to true to also open the product page. Does not change the cart.',
	input: z.object({
		catalog: z._default(
			z.object({
				id: z.optional(
					z
						.string()
						.check(
							z.minLength(1),
							z.describe(
								'Product id, handle or /products/<handle> path. Defaults to the current page product.',
							),
						),
				),
				navigate: z.optional(z.boolean().check(z.describe('Open the product page in the browser.'))),
				selected_options: z.optional(
					z.array(selectedOption).check(z.describe('Known option choices that narrow the variants.')),
				),
			}),
			{},
		),
	}),
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
	readOnlyOverMcp: true,
});

export const showVariantTool = defineSpec({
	name: 'show_variant',
	title: 'Show a variant',
	description:
		'Open a product page in the browser with a variant selected: an exact variant_id, or partial selected_options, which pick the first available match. Does not change the cart; take the variant id from get_product for that.',
	input: z.object({
		catalog: z.object({
			handle: z.optional(
				z.string().check(z.minLength(1), z.describe('Product handle. Defaults to the current page product.')),
			),
			variant_id: z.optional(
				z.string().check(z.minLength(1), z.describe('ProductVariant id from get_product variants[].id.')),
			),
			selected_options: z.optional(
				z.array(selectedOption).check(z.describe('Partial option choices, such as only the color.')),
			),
		}),
	}),
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page'],
});

export const getCartTool = defineSpec({
	name: 'get_cart',
	title: 'Get the cart',
	description:
		"Read the shopper's cart: its id, every line with its line id, titles, variant id, unit and line price, and the subtotal. update_cart starts from this result.",
	input: z.object({ id: cartIdField }),
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const createCartTool = defineSpec({
	name: 'create_cart',
	title: 'Create the cart',
	description:
		"Put items in the shopper's cart while it is empty. When the cart already has items nothing changes, and the result is that cart with an error message; use update_cart then. Over /mcp every call starts a new cart.",
	input: z.object({
		cart: z.object({
			line_items: z
				.array(lineItem)
				.check(z.minLength(1), z.maxLength(MAX_LINE_ITEMS), z.describe('The items the new cart holds.')),
		}),
	}),
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const updateCartTool = defineSpec({
	name: 'update_cart',
	title: 'Update the cart',
	description:
		'Set the cart to exactly the listed lines: a listed line takes the given quantity, an unlisted line is removed, and an empty list empties the cart. Send the lines from the latest cart result; when the cart changed since, nothing changes and an error message explains it.',
	input: z.object({
		id: cartIdField,
		cart: z.object({
			line_items: z.optional(
				z
					.array(
						z.extend(lineItem, {
							id: z.optional(
								z
									.string()
									.check(z.describe('Line id from a cart result, for a line already in the cart.')),
							),
						}),
					)
					.check(
						z.maxLength(MAX_LINE_ITEMS),
						z.describe('Every line the cart holds afterwards. Omit to leave the lines as they are.'),
					),
			),
		}),
	}),
	annotations: {
		readOnlyHint: false,
		consequentialHint: false,
		idempotentHint: true,
		destructiveHint: true,
		untrustedContentHint: true,
	},
	surfaces: ['page', 'mcp'],
});

export const cancelCartTool = defineSpec({
	name: 'cancel_cart',
	title: 'Empty the cart',
	description: 'Remove every item from the cart in one step, for a shopper who wants to start over.',
	input: z.object({ id: cartIdField }),
	annotations: { readOnlyHint: false, consequentialHint: false, destructiveHint: true },
	surfaces: ['page', 'mcp'],
});

export const proceedToCheckoutTool = defineSpec({
	name: 'proceed_to_checkout',
	title: 'Go to checkout',
	description:
		"Check the cart has items, then open the store's checkout in the browser, where the shopper pays. Over /mcp it returns the checkout URL to hand to the shopper.",
	input: z.object({ id: cartIdField }),
	annotations: { readOnlyHint: false, consequentialHint: false },
	surfaces: ['page', 'mcp'],
});

export const askBusinessTool = defineSpec({
	name: 'ask_business',
	title: 'Ask the store',
	description:
		"Ask about the store's policies and services: returns and refunds, shipping, privacy, terms, contact details, or FAQ topics such as gift wrapping. One question per call, in the shopper's words. Read-only; for products and prices use search_catalog.",
	input: z.object({
		ask: z.object({
			query: z
				.string()
				.check(z.trim(), z.minLength(1), z.maxLength(10_000), z.describe("The shopper's question.")),
			context: z.optional(
				z
					.object({
						intent: z.optional(z.string()),
						address_country: z.optional(z.string()),
						address_region: z.optional(z.string()),
						language: z.optional(z.string()),
					})
					.check(z.describe('Optional buyer context; send only what the question needs.')),
			),
		}),
	}),
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page', 'mcp'],
});

export const addToCartTool = defineSpec({
	name: 'add_to_cart',
	title: 'Add to cart',
	description:
		"Add a variant of the product on this page to the shopper's cart, on top of what the cart holds. Take the variant id from get_product. Returns the whole cart.",
	input: lineItem,
	annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
	surfaces: ['page'],
});

export const getUcpProfileTool = defineSpec({
	name: 'get_ucp_profile',
	title: 'Get the UCP profile',
	description:
		"Read the store's Universal Commerce Protocol profile: the capabilities it supports, such as catalog and cart, and the endpoint that serves them. Offered only when the store is a connected Shopify store.",
	input: z.object({}),
	annotations: { readOnlyHint: true, untrustedContentHint: true },
	surfaces: ['page'],
});

/**
 * Every tool, in the order a store lists them.
 */
export const storeToolSpecs: StoreToolSpec[] = [
	searchCatalogTool,
	browseStoreTool,
	getProductTool,
	showVariantTool,
	getCartTool,
	createCartTool,
	updateCartTool,
	cancelCartTool,
	proceedToCheckoutTool,
	askBusinessTool,
	addToCartTool,
	getUcpProfileTool,
];

/**
 * The tools a surface offers.
 */
export function toolsOn(surface: ToolSurface): StoreToolSpec[] {
	return storeToolSpecs.filter((tool) => tool.surfaces.includes(surface));
}

/**
 * The tool's input schema as JSON Schema, which is what an agent reads.
 */
export function inputJsonSchema(tool: StoreToolSpec): Record<string, unknown> {
	const { $schema: _schema, ...schema } = z.toJSONSchema(tool.input, { io: 'input' });
	return schema;
}

/**
 * The message a tool error carries for input that fails the schema, naming each invalid field.
 */
export function invalidInputMessage(error: z.core.$ZodError): { message: string; issues: string[] } {
	const issues = error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`);
	return { message: `Invalid input. ${issues.join('; ')}`, issues };
}

/**
 * Parses an agent's input against the tool's schema and throws an error naming each invalid field, so the agent can
 * correct the call.
 */
export function readToolInput<Input extends z.ZodMiniObject>(
	tool: StoreToolSpec<Input>,
	input: unknown,
): z.output<Input> {
	const parsed = z.safeParse(tool.input, input ?? {});
	if (!parsed.success) throw new Error(invalidInputMessage(parsed.error).message);
	return parsed.data;
}

/**
 * The part of a tool the browser registers: its definition without `execute`, which the Radiant host's decorated
 * method supplies. Pass it to `@agentTool`.
 *
 * @remarks
 * `parse` validates the agent's input in the browser, before the method runs and before a request is made; the
 * server checks it again, since a client can skip the browser. `getEnabled` follows {@link modelContextPresent}, so
 * the tool registers when `document.modelContext` appears after the host connected. `inputSchema` is built once, when the first host
 * reads it, and is a few kilobytes of JSON Schema for all the tools of a page.
 */
export function agentToolConfig<Input extends z.ZodMiniObject>(
	tool: StoreToolSpec<Input>,
): Omit<AgentToolConfig<AgentToolHost, z.output<Input>>, 'execute'> {
	const { readOnlyHint, consequentialHint, untrustedContentHint } = tool.annotations;
	const annotations = Object.fromEntries(
		Object.entries({ readOnlyHint, consequentialHint, untrustedContentHint }).filter(
			([, hint]) => hint !== undefined,
		),
	);
	let inputSchema: Record<string, unknown> | undefined;
	return {
		name: tool.name,
		title: tool.title,
		description: tool.description,
		annotations,
		getEnabled: () => modelContextPresent.get(),
		get inputSchema() {
			inputSchema ??= inputJsonSchema(tool);
			return inputSchema;
		},
		parse: (input) => readToolInput(tool, input),
	};
}
