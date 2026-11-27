import * as z from 'zod/mini';
import { CommerceBackendError } from '@/lib/commerce/errors';
import { formatMoney, formatPriceRange, toAgentPrice } from '@/lib/commerce/money';
import type { Product, ProductSummary, ProductVariant } from '@/lib/commerce/types';
import { resolveUrl, storePaths } from '@/lib/store-urls';
import { describeUcpProfile, readUcpProfile } from '@/lib/ucp/ucp.server';
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
	clipText,
	fitToPageResult,
	pageSummaryView,
	pageVariantView,
	PAGE_RESULT_CHARACTERS,
	resultSize,
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

/* What a page tool lists, so a result stays within `PAGE_RESULT_CHARACTERS`; `/mcp` has no such limit. */

const PAGE_PRODUCTS_PER_PAGE = 3;
const PAGE_RELATED_LIMIT = 3;
const PAGE_DESCRIPTION_CHARACTERS = 240;

/**
 * How much of an answer `ask_business` gives a page, as policies and characters a paragraph, from most to least: the
 * first that fits `PAGE_RESULT_CHARACTERS` is used, and the last when none does.
 */
const PAGE_ANSWER_SIZES: Array<{ policies: number; characters: number }> = [
	{ policies: 2, characters: 280 },
	{ policies: 2, characters: 160 },
	{ policies: 1, characters: 280 },
	{ policies: 1, characters: 140 },
	{ policies: 1, characters: 70 },
];
const MAX_OPTION_COMBINATIONS = 50;

/* The tools. */

export const storeTools: StoreTool[] = [
	define(searchCatalogTool, async ({ catalog }, { provider, origin, surface }) => {
		const limit = catalog.pagination?.limit ?? 5;
		const terms = searchTerms(catalog.query);
		const [products, collections, policies] = await Promise.all([
			provider.searchProducts(catalog.query, { limit }),
			provider.listCollections({ limit: 100 }),
			provider.listPolicies(),
		]);
		const related = surface === 'page' ? Math.min(limit, PAGE_RELATED_LIMIT) : limit;
		const describeResult = (shown: ProductSummary[]) => {
			const structured = {
				products: shown.map((product) =>
					surface === 'page' ? pageSummaryView(product, origin) : summaryView(product, origin),
				),
				collections: collections
					.filter((collection) => terms.some((term) => collection.title.toLowerCase().includes(term)))
					.slice(0, related)
					.map((collection) => ({
						title: collection.title,
						handle: collection.handle,
						url: resolveUrl(origin, storePaths.collection(collection.handle)),
					})),
				articles: [],
				pages: policies
					.filter((policy) => relevance(`${policy.title} ${policy.body}`, terms) > 0)
					.slice(0, related)
					.map((policy) => ({
						title: policy.title,
						url: resolveUrl(origin, storePaths.policy(policy.handle)),
					})),
				search_url: resolveUrl(origin, storePaths.search(catalog.query)),
				...(shown.length < products.length ? { products_not_shown: products.length - shown.length } : {}),
			};
			const text = products.length
				? `Found ${products.length} product(s)${shown.length < products.length ? `, ${shown.length} shown to keep the result short; search again with a narrower query for the rest` : ''}.`
				: `No products match "${catalog.query}".`;
			return ok(structured, text);
		};
		const shown =
			surface === 'page' ? fitToPageResult(products, (list) => resultSize(describeResult(list))) : products;
		return { result: describeResult(shown) };
	}),
	define(
		browseStoreTool,
		async ({ collection, navigate, sort_by: sortBy = 'best-selling', page = 1 }, { provider, origin, surface }) => {
			if (!collection) {
				const collections = await provider.listCollections({ limit: 100 });
				const describeCollections = (shown: typeof collections) => {
					const list = shown.map((entry) => ({
						title: entry.title,
						handle: entry.handle,
						url: resolveUrl(origin, storePaths.collection(entry.handle)),
						...(surface === 'page' ? {} : { description: entry.description }),
					}));
					return ok(
						{ collections: list },
						`The store has ${collections.length} collection(s): ${list.map((entry) => entry.title).join(', ')}${list.length < collections.length ? ', and more' : ''}.`,
					);
				};
				const shown =
					surface === 'page'
						? fitToPageResult(collections, (list) => resultSize(describeCollections(list)))
						: collections;
				return { result: describeCollections(shown) };
			}

			const pageSize = surface === 'page' ? PAGE_PRODUCTS_PER_PAGE : PRODUCTS_PER_PAGE;
			const listing = { limit: pageSize + 1, offset: (page - 1) * pageSize, sort: sortBy };
			const found =
				collection === 'all'
					? {
							title: 'All products',
							products: await provider.listProducts(listing),
							path: '/',
						}
					: await provider.getCollection(collection, listing).then((entry) =>
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

			const products = found.products.slice(0, pageSize);
			const hasMore = found.products.length > pageSize;
			const url = resolveUrl(origin, found.path);
			const navigated = Boolean(navigate) && surface === 'page';
			return {
				result: ok(
					{
						products: products.map((product) =>
							surface === 'page' ? pageSummaryView(product, origin) : summaryView(product, origin),
						),
						collection_title: found.title,
						page,
						sort_by: sortBy,
						navigated,
						url,
						page_size: pageSize,
						has_more: hasMore,
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
		const summary = `${product.title}, ${formatMoney(product.priceRange.min)}, ${product.availableForSale ? 'in stock' : 'sold out'}. ${candidates.length} matching variant(s).`;
		if (context.surface === 'page') {
			const listed = complete ? candidates.slice(0, 1) : candidates;
			const describeProduct = (shown: ProductVariant[]) =>
				ok(
					{
						title: product.title,
						handle: product.handle,
						description: clipText(product.description, PAGE_DESCRIPTION_CHARACTERS),
						url,
						price: formatPriceRange(product.priceRange),
						available: product.availableForSale,
						options: product.options,
						variants: shown.map(pageVariantView),
						...(shown.length < listed.length
							? {
									variants_not_shown: listed.length - shown.length,
									hint: 'Pass selected_options to narrow the variants.',
								}
							: {}),
						navigated,
					},
					summary,
				);
			const shown = fitToPageResult(listed, (list) => resultSize(describeProduct(list)));
			return { result: describeProduct(shown), ...(navigated ? { navigateTo: url } : {}) };
		}
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
		return { result: ok(structured, summary), ...(navigated ? { navigateTo: url } : {}) };
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
	define(askBusinessTool, async ({ ask }, { provider, origin, surface }) => {
		const terms = searchTerms(ask.query);
		const policies = await provider.listPolicies();
		const ranked = policies
			.map((policy) => {
				const paragraphs = policy.body
					.split(/\n\s*\n/u)
					.map((paragraph) => ({ paragraph, score: relevance(paragraph, terms) }))
					.filter((entry) => entry.score > 0)
					.sort((a, b) => b.score - a.score);
				return { policy, paragraphs, score: paragraphs[0]?.score ?? 0 };
			})
			.filter((section) => section.score > 0)
			.sort((a, b) => b.score - a.score);
		const link = (policy: (typeof policies)[number]) => ({
			type: policy.type,
			url: resolveUrl(origin, storePaths.policy(policy.handle)),
			title: policy.title,
		});
		/**
		 * The answer from the best `sectionCount` policies, each with `paragraphCount` paragraphs cut to `clip`
		 * characters when a limit is given.
		 */
		const answer = (sectionCount: number, paragraphCount: number, clip?: number) => {
			const sections = ranked.slice(0, sectionCount);
			const plain = sections.length
				? sections
						.map(({ policy, paragraphs }) =>
							[
								`${policy.title} (${resolveUrl(origin, storePaths.policy(policy.handle))}):`,
								...paragraphs
									.slice(0, paragraphCount)
									.map((entry) => (clip ? clipText(entry.paragraph, clip) : entry.paragraph)),
							].join('\n'),
						)
						.join('\n\n')
				: 'The store has no published information about that. Its policies are linked below.';
			const linked = (sections.length ? sections.map((section) => section.policy) : policies).slice(
				0,
				clip ? sectionCount + 1 : undefined,
			);
			return ok({ answer: { plain }, links: linked.map(link) }, plain);
		};
		if (surface !== 'page') return { result: answer(3, 2) };
		const attempts = PAGE_ANSWER_SIZES.map(({ policies: count, characters }) => answer(count, 1, characters));
		const fitting = attempts.find((result) => resultSize(result) <= PAGE_RESULT_CHARACTERS);
		return { result: fitting ?? answer(1, 1, PAGE_ANSWER_SIZES[PAGE_ANSWER_SIZES.length - 1]?.characters) };
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
	define(getUcpProfileTool, async (_input, { origin, provider }) => {
		try {
			const profile = await readUcpProfile(origin, { provider });
			if (!profile)
				return fail('This store runs on the demo catalog and has no UCP profile. Use the /mcp server.');
			return { result: ok(profile, describeUcpProfile(profile)) };
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
