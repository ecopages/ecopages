import * as z from 'zod/mini';
import { CommerceBackendError } from '@/lib/commerce/errors';
import { formatMoney, toAgentPrice } from '@/lib/commerce/money';
import type { Product, ProductSummary } from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';
import { readUcpProfile } from '@/lib/ucp/ucp.server';
import {
	addToCartTool,
	askBusinessTool,
	browseStoreTool,
	cancelCartTool,
	createCartTool,
	getCartTool,
	getProductTool,
	getUcpProfileTool,
	invalidInputMessage,
	proceedToCheckoutTool,
	searchCatalogTool,
	showVariantTool,
	type ToolSurface,
	updateCartTool,
} from './store-tool-definitions';
import {
	type StoreTool,
	type StoreToolContext,
	type StoreToolOutcome,
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

export type { StoreToolResult } from './agent-tool-types';
export type { StoreTool, StoreToolContext, StoreToolOutcome } from './store-tool-support.server';
export type { ToolSurface } from './store-tool-definitions';

const PRODUCTS_PER_PAGE = 30;
const MAX_OPTION_COMBINATIONS = 50;

/* The tools. */

export const storeTools: StoreTool[] = [
	define(searchCatalogTool, async ({ catalog }, { provider, origin }) => {
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
	}),
	define(
		browseStoreTool,
		async ({ collection, navigate, sort_by: sortBy = 'best-selling', page = 1 }, { provider, origin, surface }) => {
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
	),
	define(getProductTool, async ({ catalog }, context) => {
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
	}),
	define(showVariantTool, async ({ catalog }, context) => {
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
	}),
	define(getCartTool, async ({ id }, context) => {
		if (context.surface === 'mcp' && !id) return fail('Pass id, the cart id that create_cart returned.');
		const { cart } = await currentCart(id, context);
		if (context.surface === 'mcp' && !cart)
			return fail('No cart with that id. It may have expired; create_cart starts a new one.');
		const view = cartView(cart, context);
		return { result: ok(view, describeCart(view)) };
	}),
	define(createCartTool, async ({ cart: request }, context) => {
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
	}),
	define(updateCartTool, async ({ id, cart: request }, context) => {
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
	}),
	define(cancelCartTool, async ({ id }, context) => {
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
	}),
	define(proceedToCheckoutTool, async ({ id }, context) => {
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
	}),
	define(askBusinessTool, async ({ ask }, { provider, origin }) => {
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
	}),
	define(addToCartTool, async ({ item, quantity }, context) => {
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
	}),
	define(getUcpProfileTool, async (_input, { origin }) => {
		try {
			const profile = await readUcpProfile(origin);
			if (!profile)
				return fail('This store runs on the demo catalog and has no UCP profile. Use the /mcp server.');
			return { result: ok(profile, JSON.stringify(profile)) };
		} catch (error) {
			if (error instanceof CommerceBackendError) return fail(error.message);
			throw error;
		}
	}),
];

const byName = new Map(storeTools.map((tool) => [tool.name, tool]));

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
	const parsed = z.safeParse(tool.input, input ?? {});
	if (!parsed.success) {
		const { message, issues } = invalidInputMessage(parsed.error);
		return fail(message, { error: 'invalid_input', issues });
	}
	return tool.run(parsed.data, context);
}
