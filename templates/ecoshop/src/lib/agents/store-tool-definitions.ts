import * as z from 'zod/mini';
import { MAX_LINE_QUANTITY, PRODUCT_SORTS } from '@/lib/commerce/types';
import {
	addToCartInfo,
	askBusinessInfo,
	browseStoreInfo,
	cancelCartInfo,
	createCartInfo,
	getCartInfo,
	getProductInfo,
	getUcpProfileInfo,
	proceedToCheckoutInfo,
	searchCatalogInfo,
	showVariantInfo,
	updateCartInfo,
	type StoreToolInfo,
} from './store-tool-info';

/**
 * The store's tool definitions: each tool's {@link StoreToolInfo} from `store-tool-info.ts` with its input schema.
 *
 * @remarks
 * The `/mcp` server and the `/api/agent-tools` Endpoint import this module, and the Radiant hosts that register the
 * page tools with WebMCP reach it through `agentToolConfig` (`agent-tool-config.ts`), which finds a tool's schema in
 * {@link toolsByName} by the name its info carries. All three read the same info and the same schema, so they cannot
 * disagree about what a tool is called or what it takes. The module carries no server code and no `run`; what a tool
 * does lives in `store-tools.server.ts`.
 *
 * The schemas use `zod/mini`, whose functions a bundler can drop one by one, so the browser carries the few it uses
 * instead of the whole classic API: the Zod chunk of a built store is 14 kB gzipped, against 26 kB with classic Zod.
 * The hosts import this module only inside `import()`, which Radiant runs when a tool registers, so a visitor whose
 * browser has no `document.modelContext` never downloads that chunk.
 *
 * @module
 */

export interface StoreToolSpec<Input extends z.ZodMiniObject = z.ZodMiniObject> extends StoreToolInfo {
	input: Input;
}

/**
 * The typed input of a tool, which is what its Radiant host's method receives from the UI and from an agent.
 */
export type ToolInput<Tool extends StoreToolSpec> = z.output<Tool['input']>;

function defineSpec<const Name extends string, Input extends z.ZodMiniObject>(
	spec: StoreToolSpec<Input> & { name: Name },
): StoreToolSpec<Input> & { name: Name } {
	return spec;
}

const MAX_LINE_ITEMS = 100;

/**
 * The last page `browse_store` reads: a provider that pages by cursor reads every product before the page.
 */
const MAX_PAGE = 100;

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
	...searchCatalogInfo,
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
});

export const browseStoreTool = defineSpec({
	...browseStoreInfo,
	input: z.object({
		collection: z.optional(
			z.string().check(z.minLength(1), z.describe('Collection handle, or "all". Omit to list collections.')),
		),
		navigate: z.optional(
			z.boolean().check(z.describe('Open the collection page in the browser. Needs a collection handle.')),
		),
		sort_by: z.optional(z.enum(PRODUCT_SORTS).check(z.describe('Sort order; best-selling by default.'))),
		page: z.optional(z.int().check(z.minimum(1), z.maximum(MAX_PAGE), z.describe('Page number, from 1.'))),
		offset: z.optional(
			z
				.int()
				.check(
					z.minimum(0),
					z.describe(
						'Products to skip, which a page number does not give; use next_offset of the last result.',
					),
				),
		),
	}),
});

export const getProductTool = defineSpec({
	...getProductInfo,
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
});

export const showVariantTool = defineSpec({
	...showVariantInfo,
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
});

export const getCartTool = defineSpec({
	...getCartInfo,
	input: z.object({
		id: cartIdField,
		offset: z.optional(
			z
				.int()
				.check(
					z.minimum(0),
					z.describe('The first line to show, from 0. Only a page paginates; /mcp returns every line.'),
				),
		),
		limit: z.optional(
			z.int().check(z.minimum(1), z.maximum(100), z.describe('Most lines to show. A page may show fewer.')),
		),
	}),
});

export const createCartTool = defineSpec({
	...createCartInfo,
	input: z.object({
		cart: z.object({
			line_items: z
				.array(lineItem)
				.check(z.minLength(1), z.maxLength(MAX_LINE_ITEMS), z.describe('The items the new cart holds.')),
		}),
	}),
});

export const updateCartTool = defineSpec({
	...updateCartInfo,
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
							quantity: z
								.int()
								.check(
									z.minimum(0),
									z.maximum(MAX_LINE_QUANTITY),
									z.describe('The quantity the line holds afterwards; 0 removes it.'),
								),
						}),
					)
					.check(
						z.maxLength(MAX_LINE_ITEMS),
						z.describe('The lines to change. Omit to leave the cart as it is.'),
					),
			),
		}),
	}),
});

export const cancelCartTool = defineSpec({
	...cancelCartInfo,
	input: z.object({ id: cartIdField }),
});

export const proceedToCheckoutTool = defineSpec({
	...proceedToCheckoutInfo,
	input: z.object({ id: cartIdField }),
});

export const askBusinessTool = defineSpec({
	...askBusinessInfo,
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
});

export const addToCartTool = defineSpec({
	...addToCartInfo,
	input: lineItem,
});

export const getUcpProfileTool = defineSpec({
	...getUcpProfileInfo,
	input: z.object({}),
});

/**
 * Every tool by its name, which is how `agentToolConfig` gets from the info a host holds to the schema.
 */
export const toolsByName = {
	[searchCatalogTool.name]: searchCatalogTool,
	[browseStoreTool.name]: browseStoreTool,
	[getProductTool.name]: getProductTool,
	[showVariantTool.name]: showVariantTool,
	[getCartTool.name]: getCartTool,
	[createCartTool.name]: createCartTool,
	[updateCartTool.name]: updateCartTool,
	[cancelCartTool.name]: cancelCartTool,
	[proceedToCheckoutTool.name]: proceedToCheckoutTool,
	[askBusinessTool.name]: askBusinessTool,
	[addToCartTool.name]: addToCartTool,
	[getUcpProfileTool.name]: getUcpProfileTool,
};

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
