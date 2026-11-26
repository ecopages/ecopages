import { z } from 'zod';
import { formatMoney, toAgentPrice } from '@/lib/commerce/money';
import { MAX_LINE_QUANTITY, type Product, type ProductSummary } from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';
import type { StoreToolDescriptor } from './agent-tool-types';

import {
	type StoreTool,
	type StoreToolContext,
	type StoreToolOutcome,
	type ToolSurface,
	applyCartChange,
	cartOutcome,
	cartView,
	currentCart,
	define,
	describeCart,
	fail,
	isOutcome,
	lineProblem,
	matches,
	ok,
	productHandleFrom,
	productUrl,
	relevance,
	replacementQuantities,
	searchTerms,
	summaryView,
	textToHtml,
	variantView,
} from './store-tool-support.server';

export type { StoreToolDescriptor, StoreToolResult } from './agent-tool-types';
export type { StoreTool, StoreToolContext, StoreToolOutcome, ToolSurface } from './store-tool-support.server';

const PRODUCTS_PER_PAGE = 30;
const MAX_LINE_ITEMS = 100;
const MAX_OPTION_COMBINATIONS = 50;

/* Schemas shared by several tools. */

const selectedOption = z.object({
	name: z.string().describe('Option name, such as "Size".'),
	value: z.string().describe('Option value, such as "M".'),
});

const lineItem = z.object({
	item: z.object({
		id: z.string().min(1).describe('ProductVariant id: variant_id from search, variants[].id from get_product.'),
	}),
	quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).describe('How many of this item the line holds.'),
});

const cartIdField = z
	.string()
	.min(1)
	.optional()
	.describe("On a store page, compared with the shopper's cart. Over /mcp, the cart to act on.");

/* The tools. */

export const storeTools: StoreTool[] = [
	define({
		name: 'search_catalog',
		title: 'Search the catalog',
		description:
			'Search the store for products, collections and pages by keywords. Each product carries variant_id, its first available variant, which create_cart and update_cart take. Read-only: it never changes the cart.',
		input: z.object({
			catalog: z.object({
				query: z.string().trim().min(1).max(200).describe('Search keywords.'),
				pagination: z
					.object({
						limit: z.number().int().min(1).max(10).default(5).describe('Results per type, 1 to 10.'),
					})
					.optional(),
			}),
		}),
		annotations: { readOnlyHint: true, untrustedContentHint: true },
		surfaces: ['page', 'mcp'],
		run: async ({ catalog }, { provider, origin }) => {
			const limit = catalog.pagination?.limit ?? 5;
			const terms = searchTerms(catalog.query);
			const [products, collections, policies] = await Promise.all([
				provider.searchProducts(catalog.query, { limit }),
				provider.listCollections({ limit: 100 }),
				provider.listPolicies(),
			]);
			const structured = {
				products: products.map((product) => summaryView(product, origin)),
				collections: collections
					.filter((collection) => terms.some((term) => collection.title.toLowerCase().includes(term)))
					.slice(0, limit)
					.map((collection) => ({
						title: collection.title,
						handle: collection.handle,
						url: resolveUrl(origin, storePaths.collection(collection.handle)),
					})),
				articles: [],
				pages: policies
					.filter((policy) => relevance(`${policy.title} ${policy.body}`, terms) > 0)
					.slice(0, limit)
					.map((policy) => ({
						title: policy.title,
						url: resolveUrl(origin, storePaths.policy(policy.handle)),
					})),
				search_url: resolveUrl(origin, storePaths.search(catalog.query)),
			};
			return {
				result: ok(
					structured,
					products.length
						? `Found ${products.length} product(s): ${products.map((product) => product.title).join(', ')}.`
						: `No products match "${catalog.query}".`,
				),
			};
		},
	}),
	define({
		name: 'browse_store',
		title: 'Browse collections',
		description:
			'Without a collection handle, list the store collections. With one, list its products, 30 per page; "all" lists every product. Set navigate to true to also open the collection page in the browser. Does not change the cart.',
		input: z.object({
			collection: z.string().min(1).optional().describe('Collection handle, or "all". Omit to list collections.'),
			navigate: z
				.boolean()
				.optional()
				.describe('Open the collection page in the browser. Needs a collection handle.'),
			sort_by: z
				.enum(['best-selling', 'price-ascending', 'price-descending', 'title-ascending', 'title-descending'])
				.optional()
				.describe('Sort order; best-selling by default.'),
			page: z.number().int().min(1).optional().describe('Page number, from 1.'),
		}),
		annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
		surfaces: ['page', 'mcp'],
		readOnlyOverMcp: true,
		run: async (
			{ collection, navigate, sort_by: sortBy = 'best-selling', page = 1 },
			{ provider, origin, surface },
		) => {
			if (!collection) {
				const collections = await provider.listCollections({ limit: 100 });
				const list = collections.map((entry) => ({
					title: entry.title,
					handle: entry.handle,
					url: resolveUrl(origin, storePaths.collection(entry.handle)),
					description: entry.description,
				}));
				return {
					result: ok(
						{ collections: list },
						`The store has ${list.length} collection(s): ${list.map((entry) => entry.title).join(', ')}.`,
					),
				};
			}

			const found =
				collection === 'all'
					? {
							title: 'All products',
							products: await provider.listProducts({ limit: 250 }),
							path: '/',
						}
					: await provider.getCollection(collection, { limit: 250 }).then((entry) =>
							entry
								? {
										title: entry.collection.title,
										products: entry.products,
										path: storePaths.collection(collection),
									}
								: null,
						);
			if (!found)
				return fail(
					`No collection with handle "${collection}". Call browse_store without a collection to list them.`,
				);

			const sorted = [...found.products];
			const price = (product: ProductSummary) => Number(product.priceRange.min.amount);
			if (sortBy === 'price-ascending') sorted.sort((a, b) => price(a) - price(b));
			if (sortBy === 'price-descending') sorted.sort((a, b) => price(b) - price(a));
			if (sortBy === 'title-ascending') sorted.sort((a, b) => a.title.localeCompare(b.title));
			if (sortBy === 'title-descending') sorted.sort((a, b) => b.title.localeCompare(a.title));
			const products = sorted.slice((page - 1) * PRODUCTS_PER_PAGE, page * PRODUCTS_PER_PAGE);
			const url = resolveUrl(origin, found.path);
			const navigated = Boolean(navigate) && surface === 'page';
			return {
				result: ok(
					{
						products: products.map((product) => summaryView(product, origin)),
						collection_title: found.title,
						page,
						sort_by: sortBy,
						navigated,
						url,
					},
					`${found.title}: ${products.length} product(s) on page ${page}.${navigated ? ` Opening ${url}.` : ''}`,
				),
				...(navigated ? { navigateTo: url } : {}),
			};
		},
	}),
	define({
		name: 'get_product',
		title: 'Get a product',
		description:
			'Read a product: description, options, variants with their ids, prices and availability. Defaults to the product of the current page. Pass selected_options to narrow the variants. Set navigate to true to also open the product page. Does not change the cart.',
		input: z.object({
			catalog: z
				.object({
					id: z
						.string()
						.min(1)
						.optional()
						.describe(
							'Product id, handle or /products/<handle> path. Defaults to the current page product.',
						),
					navigate: z.boolean().optional().describe('Open the product page in the browser.'),
					selected_options: z
						.array(selectedOption)
						.optional()
						.describe('Known option choices that narrow the variants.'),
				})
				.default({}),
		}),
		annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
		surfaces: ['page', 'mcp'],
		readOnlyOverMcp: true,
		run: async ({ catalog }, context) => {
			const handle = productHandleFrom(catalog.id, context);
			if (!handle)
				return fail(
					context.surface === 'page' ? 'Pass catalog.id: this page shows no product.' : 'Pass catalog.id.',
				);
			const product: Product | null = await context.provider.getProduct(handle);
			if (!product) return fail(`No product "${handle}".`);

			const selected = catalog.selected_options ?? [];
			const candidates = product.variants.filter((variant) => matches(variant, selected));
			const complete = selected.length > 0 && selected.length === product.options.length;
			const combinations = candidates
				.filter((variant) => variant.availableForSale)
				.map((variant) => variant.selectedOptions);
			const url = productUrl(context.origin, product.handle);
			const navigated = Boolean(catalog.navigate) && context.surface === 'page';
			const structured = {
				id: product.id,
				title: product.title,
				handle: product.handle,
				description: { html: textToHtml(product.description) },
				vendor: product.vendor,
				type: product.productType,
				tags: product.tags,
				url,
				price_range: { min: toAgentPrice(product.priceRange.min), max: toAgentPrice(product.priceRange.max) },
				available: product.availableForSale,
				options: product.options,
				variants: (complete ? candidates.slice(0, 1) : candidates).map(variantView),
				available_options: combinations.slice(0, MAX_OPTION_COMBINATIONS),
				available_options_count: combinations.length,
				available_options_truncated: combinations.length > MAX_OPTION_COMBINATIONS,
				...(selected.length ? { available_options_filter: selected } : {}),
				images: product.images.map((image) => resolveUrl(context.origin, image.url)),
				navigated,
			};
			return {
				result: ok(
					structured,
					`${product.title}, ${formatMoney(product.priceRange.min)}, ${product.availableForSale ? 'in stock' : 'sold out'}. ${candidates.length} matching variant(s).`,
				),
				...(navigated ? { navigateTo: url } : {}),
			};
		},
	}),
	define({
		name: 'show_variant',
		title: 'Show a variant',
		description:
			'Open a product page in the browser with a variant selected: an exact variant_id, or partial selected_options, which pick the first available match. Does not change the cart; take the variant id from get_product for that.',
		input: z.object({
			catalog: z.object({
				handle: z.string().min(1).optional().describe('Product handle. Defaults to the current page product.'),
				variant_id: z.string().min(1).optional().describe('ProductVariant id from get_product variants[].id.'),
				selected_options: z
					.array(selectedOption)
					.optional()
					.describe('Partial option choices, such as only the color.'),
			}),
		}),
		annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
		surfaces: ['page'],
		run: async ({ catalog }, context) => {
			const handle = catalog.handle ?? context.currentProductHandle;
			if (!handle) return fail('Pass catalog.handle: this page shows no product.');
			const product = await context.provider.getProduct(handle);
			if (!product) return fail(`No product "${handle}".`);
			const selected = catalog.selected_options ?? [];
			const variant = catalog.variant_id
				? product.variants.find(
						(entry) => entry.id === catalog.variant_id || entry.id.endsWith(`/${catalog.variant_id}`),
					)
				: (product.variants.find((entry) => entry.availableForSale && matches(entry, selected)) ??
					product.variants.find((entry) => matches(entry, selected)));
			if (!variant) return fail(`No variant of ${product.title} matches.`);
			const url = productUrl(context.origin, product.handle, variant.id);
			return {
				result: ok(
					{
						handle: product.handle,
						variant_id: variant.id,
						url,
						navigated: true,
						selected_options: variant.selectedOptions,
					},
					`Opening ${product.title} (${variant.title}).`,
				),
				navigateTo: url,
			};
		},
	}),
	define({
		name: 'get_cart',
		title: 'Get the cart',
		description:
			"Read the shopper's cart: its id, every line with its line id, titles, variant id, unit and line price, and the subtotal. update_cart starts from this result.",
		input: z.object({ id: cartIdField }),
		annotations: { readOnlyHint: true, untrustedContentHint: true },
		surfaces: ['page', 'mcp'],
		run: async ({ id }, context) => {
			if (context.surface === 'mcp' && !id) return fail('Pass id, the cart id that create_cart returned.');
			const { cart } = await currentCart(id, context);
			if (context.surface === 'mcp' && !cart)
				return fail('No cart with that id. It may have expired; create_cart starts a new one.');
			const view = cartView(cart, context);
			return { result: ok(view, describeCart(view)) };
		},
	}),
	define({
		name: 'create_cart',
		title: 'Create the cart',
		description:
			"Put items in the shopper's cart while it is empty. When the cart already has items nothing changes, and the result is that cart with an error message; use update_cart then. Over /mcp every call starts a new cart.",
		input: z.object({
			cart: z.object({
				line_items: z.array(lineItem).min(1).max(MAX_LINE_ITEMS).describe('The items the new cart holds.'),
			}),
		}),
		annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
		surfaces: ['page', 'mcp'],
		run: async ({ cart: request }, context) => {
			const { cart } = await currentCart(undefined, context);
			if (cart && cart.totalQuantity > 0) {
				const view = cartView(cart, context, [
					{
						type: 'error',
						code: 'cart_not_empty',
						content: 'The cart already has items. Use update_cart to change it.',
					},
				]);
				return { result: ok(view, `Nothing changed. ${describeCart(view)}`) };
			}
			const problem = lineProblem(request.line_items, null);
			if (problem) return fail(problem.message);
			const created = await applyCartChange(() =>
				context.provider.setCartQuantities(
					cart?.id,
					request.line_items.map((line) => ({ variantId: line.item.id, quantity: line.quantity })),
				),
			);
			return isOutcome(created) ? created : cartOutcome(created, context);
		},
	}),
	define({
		name: 'update_cart',
		title: 'Update the cart',
		description:
			'Set the cart to exactly the listed lines: a listed line takes the given quantity, an unlisted line is removed, and an empty list empties the cart. Send the lines from the latest cart result; when the cart changed since, nothing changes and an error message explains it.',
		input: z.object({
			id: cartIdField,
			cart: z.object({
				line_items: z
					.array(
						lineItem.extend({
							id: z
								.string()
								.optional()
								.describe('Line id from a cart result, for a line already in the cart.'),
						}),
					)
					.max(MAX_LINE_ITEMS)
					.optional()
					.describe('Every line the cart holds afterwards. Omit to leave the lines as they are.'),
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
		run: async ({ id, cart: request }, context) => {
			if (context.surface === 'mcp' && !id) return fail('Pass id, the cart id that create_cart returned.');
			const { cart, mismatch } = await currentCart(id, context);
			const stale = (content: string) => {
				const view = cartView(cart, context, [{ type: 'error', code: 'cart_changed', content }]);
				return { result: ok(view, `Nothing changed. ${describeCart(view)}`) };
			};
			if (mismatch) return stale('The cart changed since that result. Read it again with get_cart.');
			if (context.surface === 'mcp' && !cart)
				return fail('No cart with that id. It may have expired; create_cart starts a new one.');
			if (!request.line_items || (!cart && request.line_items.length === 0)) {
				const view = cartView(cart, context);
				return { result: ok(view, describeCart(view)) };
			}
			const problem = lineProblem(request.line_items, cart);
			if (problem?.kind === 'repeated') return fail(problem.message);
			if (problem) return stale(problem.message);

			const lines = request.line_items;
			const updated = await applyCartChange(() =>
				context.provider.setCartQuantities(cart?.id, replacementQuantities(lines, cart)),
			);
			return isOutcome(updated) ? updated : cartOutcome(updated, context);
		},
	}),
	define({
		name: 'cancel_cart',
		title: 'Empty the cart',
		description: 'Remove every item from the cart in one step, for a shopper who wants to start over.',
		input: z.object({ id: cartIdField }),
		annotations: { readOnlyHint: false, consequentialHint: false, destructiveHint: true },
		surfaces: ['page', 'mcp'],
		run: async ({ id }, context) => {
			if (context.surface === 'mcp' && !id) return fail('Pass id, the cart id that create_cart returned.');
			const { cart, mismatch } = await currentCart(id, context);
			if (mismatch) {
				const view = cartView(cart, context, [
					{
						type: 'error',
						code: 'cart_changed',
						content: 'The cart changed since that result. Read it again with get_cart.',
					},
				]);
				return { result: ok(view, `Nothing changed. ${describeCart(view)}`) };
			}
			const previous = cart?.totalQuantity ?? 0;
			if (!cart || previous === 0) {
				return { result: ok({ cleared: true, previous_item_count: 0 }, 'The cart was already empty.') };
			}
			const emptied = await applyCartChange(() =>
				context.provider.setCartQuantities(
					cart.id,
					[...new Set(cart.lines.map((line) => line.variantId))].map((variantId) => ({
						variantId,
						quantity: 0,
					})),
				),
			);
			if (isOutcome(emptied)) return emptied;
			return {
				result: ok(
					{ cleared: true, previous_item_count: previous },
					`Removed ${previous} item(s); the cart is empty.`,
				),
				cartId: emptied.id,
				cart: emptied,
			};
		},
	}),
	define({
		name: 'proceed_to_checkout',
		title: 'Go to checkout',
		description:
			"Check the cart has items, then open the store's checkout in the browser, where the shopper pays. Over /mcp it returns the checkout URL to hand to the shopper.",
		input: z.object({ id: cartIdField }),
		annotations: { readOnlyHint: false, consequentialHint: false },
		surfaces: ['page', 'mcp'],
		run: async ({ id }, context) => {
			if (context.surface === 'mcp' && !id) return fail('Pass id, the cart id that create_cart returned.');
			const { cart } = await currentCart(id, context);
			if (!cart || cart.totalQuantity === 0) return fail('The cart is empty. Add items with create_cart first.');
			const url = resolveUrl(context.origin, cart.checkoutUrl);
			const shown = new URL(url);
			if (context.surface === 'page') shown.search = '';
			const structured = {
				navigating_to: shown.href,
				item_count: cart.totalQuantity,
				total_price: toAgentPrice(cart.subtotal),
			};
			return context.surface === 'page'
				? { result: ok(structured, `Opening checkout for ${cart.totalQuantity} item(s).`), navigateTo: url }
				: { result: ok(structured, `Checkout for ${cart.totalQuantity} item(s): ${url}`) };
		},
	}),
	define({
		name: 'ask_business',
		title: 'Ask the store',
		description:
			"Ask about the store's policies and services: returns and refunds, shipping, privacy, terms, contact details, or FAQ topics such as gift wrapping. One question per call, in the shopper's words. Read-only; for products and prices use search_catalog.",
		input: z.object({
			ask: z.object({
				query: z.string().trim().min(1).max(10_000).describe("The shopper's question."),
				context: z
					.object({
						intent: z.string().optional(),
						address_country: z.string().optional(),
						address_region: z.string().optional(),
						language: z.string().optional(),
					})
					.optional()
					.describe('Optional buyer context; send only what the question needs.'),
			}),
		}),
		annotations: { readOnlyHint: true, untrustedContentHint: true },
		surfaces: ['page', 'mcp'],
		run: async ({ ask }, { provider, origin }) => {
			const terms = searchTerms(ask.query);
			const policies = await provider.listPolicies();
			const sections = policies
				.map((policy) => {
					const paragraphs = policy.body
						.split(/\n\s*\n/u)
						.map((paragraph) => ({ paragraph, score: relevance(paragraph, terms) }))
						.filter((entry) => entry.score > 0)
						.sort((a, b) => b.score - a.score);
					return { policy, paragraphs, score: paragraphs[0]?.score ?? 0 };
				})
				.filter((section) => section.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, 3);
			const link = (policy: (typeof policies)[number]) => ({
				type: policy.type,
				url: resolveUrl(origin, storePaths.policy(policy.handle)),
				title: policy.title,
			});
			const plain = sections.length
				? sections
						.map(({ policy, paragraphs }) =>
							[
								`${policy.title} (${resolveUrl(origin, storePaths.policy(policy.handle))}):`,
								...paragraphs.slice(0, 2).map((entry) => entry.paragraph),
							].join('\n'),
						)
						.join('\n\n')
				: 'The store has no published information about that. Its policies are linked below.';
			return {
				result: ok(
					{
						answer: { plain },
						links: (sections.length ? sections.map((section) => section.policy) : policies).map(link),
					},
					plain,
				),
			};
		},
	}),
	define({
		name: 'add_to_cart',
		title: 'Add to cart',
		description:
			"Add a variant of the product on this page to the shopper's cart, on top of what the cart holds. Take the variant id from get_product. Returns the whole cart.",
		input: lineItem,
		annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: true },
		surfaces: ['page'],
		scope: 'product',
		run: async ({ item, quantity }, context) => {
			if (!context.currentProductHandle)
				return fail('add_to_cart works on a product page. Use create_cart or update_cart.');
			const product = await context.provider.getProduct(context.currentProductHandle);
			const variant = product?.variants.find((entry) => entry.id === item.id || entry.id.endsWith(`/${item.id}`));
			if (!variant) {
				return fail(
					`item.id is not a variant of the product on this page. Its variants: ${product?.variants.map((variant) => `${variant.id} (${variant.title})`).join(', ') ?? 'none'}.`,
				);
			}
			const { cart } = await currentCart(undefined, context);
			const added = await applyCartChange(() =>
				context.provider.addToCart(cart?.id, [{ variantId: variant.id, quantity }]),
			);
			return isOutcome(added) ? added : cartOutcome(added, context);
		},
	}),
];

const byName = new Map(storeTools.map((tool) => [tool.name, tool]));

/**
 * The tools of a surface as an agent sees them, with the input schema in JSON Schema.
 */
export function storeToolDescriptors(surface: ToolSurface): StoreToolDescriptor[] {
	return storeTools
		.filter((tool) => tool.surfaces.includes(surface))
		.map((tool) => {
			const { $schema: _schema, ...inputSchema } = z.toJSONSchema(tool.input, { io: 'input' });
			const { idempotentHint: _idempotent, destructiveHint: _destructive, ...annotations } = tool.annotations;
			return {
				name: tool.name,
				title: tool.title,
				description: tool.description,
				inputSchema,
				annotations,
				scope: tool.scope ?? 'store',
			};
		});
}

/**
 * The definition a surface runs, or `undefined` when the surface has no tool by that name.
 */
export function findStoreTool(name: string, surface: ToolSurface): StoreTool | undefined {
	const tool = byName.get(name);
	return tool?.surfaces.includes(surface) ? tool : undefined;
}

/**
 * Validates an agent's input against the tool's schema and runs it.
 *
 * @remarks
 * Input that fails the schema is a tool error naming each invalid field, and the tool does not run, so nothing
 * changes. A provider failure that is not a cart refusal propagates.
 */
export async function runStoreTool(name: string, input: unknown, context: StoreToolContext): Promise<StoreToolOutcome> {
	const tool = findStoreTool(name, context.surface);
	if (!tool) return fail(`No tool named "${name}" here.`);
	const parsed = tool.input.safeParse(input ?? {});
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`);
		return fail(`Invalid input. ${issues.join('; ')}`, { error: 'invalid_input', issues });
	}
	return tool.run(parsed.data, context);
}
