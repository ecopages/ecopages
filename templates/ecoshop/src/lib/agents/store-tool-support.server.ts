/**
 * The types, result views and helpers the store tools share, in the shapes Shopify's storefront tools return.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import * as z from 'zod/mini';
import { CartInputError } from '@/lib/commerce/errors';
import { type AgentPrice, formatMoney, formatPriceRange, toAgentPrice } from '@/lib/commerce/money';
import {
	type Cart,
	type CartLine,
	type CommerceProvider,
	type ProductSummary,
	type ProductVariant,
	type SelectedOption,
} from '@/lib/commerce/types';
import { describeLine } from '@/lib/cart/cart-messages';
import { productHandleFromPath, resolveUrl, storePaths } from '@/lib/store-urls';
import type { CartViewMessage, StoreToolResult } from './agent-tool-types';
import type { StoreToolSpec } from './store-tool-definitions';
import type { ToolSurface } from './store-tool-info';

export interface StoreToolContext {
	provider: CommerceProvider;
	origin: string;
	surface: ToolSurface;
	/** On a page, the shopper's cart from the cart cookie. Over `/mcp`, unused: the input names the cart. */
	cartId: string | undefined;
	/** On a product page, its handle: `get_product` and `show_variant` default to it, and `add_to_cart` requires it. */
	currentProductHandle?: string;
}

export interface StoreToolOutcome {
	result: StoreToolResult;
	/** The cart id the shopper's cookie must hold from now on, when the call changed it. */
	cartId?: string;
	/** The cart after a change, so the caller can show its totals without reading it again. */
	cart?: Cart;
	/** A page to open once the result is returned. */
	navigateTo?: string;
}

/**
 * A tool: its shared definition and what it runs against the provider, with the input type erased so tools of
 * different inputs share one list. `run` parses its input.
 */
export type StoreTool = StoreToolSpec & {
	run(input: unknown, context: StoreToolContext): Promise<StoreToolOutcome>;
};

export function define<Input extends z.ZodMiniObject>(
	spec: StoreToolSpec<Input>,
	run: (input: z.output<Input>, context: StoreToolContext) => Promise<StoreToolOutcome>,
): StoreTool {
	return { ...spec, run: (input, context) => run(z.parse(spec.input, input), context) };
}

/* Views in the shapes Shopify's storefront tools return. */

export function productUrl(origin: string, handle: string, variantId?: string): string {
	const path = storePaths.product(handle);
	return resolveUrl(origin, variantId ? `${path}?variant=${encodeURIComponent(variantId)}` : path);
}

export function summaryView(product: ProductSummary, origin: string) {
	return {
		id: product.id,
		title: product.title,
		handle: product.handle,
		variant_id: product.defaultVariantId ?? '',
		url: productUrl(origin, product.handle),
		price_range: toAgentPrice(product.priceRange.min),
		image: product.featuredImage ? resolveUrl(origin, product.featuredImage.url) : '',
		available: product.availableForSale,
		variant_count: product.variantCount,
		options: product.options,
		product_type: product.productType,
		vendor: product.vendor,
	};
}

/**
 * The most characters Chrome recommends a WebMCP tool result holds, counted as the result is serialized for the agent.
 * Radiant warns in development when a page tool returns more.
 */
export const PAGE_RESULT_CHARACTERS = 1500;

export const PAGE_TITLE_CHARACTERS = 60;
const PAGE_VARIANT_LIMIT = 40;

/**
 * The size of a result as WebMCP serializes it for the agent.
 */
export function resultSize(result: StoreToolResult): number {
	return JSON.stringify(result).length;
}

/**
 * Keeps as many leading items as fit in {@link PAGE_RESULT_CHARACTERS}, and at least one.
 *
 * @param items What the tool would list.
 * @param size The size of the result that lists the given items.
 */
export function fitToPageResult<T>(items: T[], size: (shown: T[]) => number): T[] {
	let shown = items;
	while (shown.length > 1 && size(shown) > PAGE_RESULT_CHARACTERS) shown = shown.slice(0, -1);
	return shown;
}

/**
 * A product as a page tool lists it: what an agent needs to pick one and call `get_product` or a cart tool. The full
 * `summaryView` is for `/mcp`, where no result size is recommended.
 */
export function pageSummaryView(product: ProductSummary, origin: string, withUrl = true) {
	return {
		title: clipText(product.title, PAGE_TITLE_CHARACTERS),
		handle: product.handle,
		variant_id: product.defaultVariantId ?? '',
		...(withUrl ? { url: productUrl(origin, product.handle) } : {}),
		price: formatPriceRange(product.priceRange),
		...(product.availableForSale ? {} : { available: false }),
	};
}

/**
 * Shortens text to `limit` characters at a word end, with an ellipsis when it cuts.
 */
export function clipText(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit - 1);
	return `${cut.slice(0, cut.lastIndexOf(' ') > limit / 2 ? cut.lastIndexOf(' ') : cut.length)}...`;
}

/**
 * A variant as a page tool lists it: its id for a cart tool, its title and price.
 */
export function pageVariantView(variant: ProductVariant) {
	return {
		id: variant.id,
		title: clipText(variant.title, PAGE_VARIANT_LIMIT),
		price: formatMoney(variant.price),
		...(variant.availableForSale ? {} : { available: false }),
	};
}

export function variantView(variant: ProductVariant) {
	return {
		id: variant.id,
		title: variant.title,
		options: variant.selectedOptions,
		price: toAgentPrice(variant.price),
		list_price: variant.compareAtPrice ? toAgentPrice(variant.compareAtPrice) : null,
		availability: { available: variant.availableForSale },
	};
}

/**
 * The id a page shows an agent for the shopper's cart: a revision of its lines, not the cart id.
 *
 * @remarks
 * The cart id grants access to the cart, which is why the cart cookie is `HttpOnly`, so a page never hands it to an
 * agent. The revision changes with every line and quantity, so `update_cart` and `cancel_cart` detect a stale cart
 * result on every provider, including Shopify, whose cart id stays the same as the cart changes.
 */
function cartRevision(cart: Cart): string {
	const lines = cart.lines.map((line) => [line.id, line.variantId, line.quantity]);
	const digest = createHash('sha256').update(cart.id).update(JSON.stringify(lines)).digest('base64url');
	return `rev_${digest.slice(0, 22)}`;
}

/**
 * Which lines of a cart a page result shows: from `offset`, at most `limit`, and fewer when more would not fit.
 */
export interface CartWindow {
	offset?: number;
	limit?: number;
}

const PAGE_MESSAGE_LIMIT = 240;
const PAGE_MESSAGES = 3;

/**
 * The cart as a tool result shows it. Over `/mcp` it has the Shopify shape and every line. On a page it drops what an
 * agent can rebuild (the currency, the totals list, each item's handle, URL, image and unit price), clips the titles
 * and messages, and shows the lines of `window` only, with `line_count`, `has_more` and `next_offset` to read the rest
 * with `get_cart`.
 */
export function cartView(
	cart: Cart | null,
	context: StoreToolContext,
	messages: CartViewMessage[] = [],
	window: CartWindow = {},
	maxMessages = PAGE_MESSAGES,
) {
	const compact = context.surface === 'page';
	const lines = cart?.lines ?? [];
	const { offset, shown } = compact ? windowOf(lines, window) : { offset: 0, shown: lines };
	const subtotal: AgentPrice | null = cart ? toAgentPrice(cart.subtotal) : null;
	return {
		id: cart ? (compact ? cartRevision(cart) : cart.id) : '',
		item_count: cart?.totalQuantity ?? 0,
		total_price: subtotal,
		...(compact ? cartPaging(lines.length, offset, shown.length) : cartTotals(cart, subtotal)),
		line_items: shown.map((line) => cartLineView(line, context)),
		...cartMessages(cart, messages, compact ? maxMessages : undefined),
	};
}

function windowOf(lines: CartLine[], { offset = 0, limit }: CartWindow) {
	return { offset, shown: lines.slice(offset, limit === undefined ? undefined : offset + limit) };
}

function cartPaging(lineCount: number, offset: number, shown: number) {
	const hasMore = offset + shown < lineCount;
	return {
		line_count: lineCount,
		offset,
		has_more: hasMore,
		...(hasMore ? { next_offset: offset + shown } : {}),
	};
}

function cartMessages(cart: Cart | null, messages: CartViewMessage[], maxClipped?: number) {
	const all = [...(cart?.messages ?? []).map(({ type, code, content }) => ({ type, code, content })), ...messages];
	if (!all.length) return {};
	if (maxClipped === undefined) return { messages: all };
	return maxClipped > 0 ? { messages: all.slice(0, maxClipped).map(clipMessage) } : {};
}

function clipMessage(message: CartViewMessage): CartViewMessage {
	return { ...message, content: clipText(message.content, PAGE_MESSAGE_LIMIT) };
}

function cartTotals(cart: Cart | null, subtotal: AgentPrice | null) {
	return {
		currency: cart?.subtotal.currencyCode ?? '',
		totals: subtotal ? [{ type: 'subtotal', amount: subtotal.amount }] : [],
	};
}

function cartLineView(line: CartLine, { origin, surface }: StoreToolContext) {
	const compact = surface === 'page';
	const details = compact
		? {}
		: {
				handle: line.productHandle,
				url: productUrl(origin, line.productHandle, line.variantId),
				image: line.image ? resolveUrl(origin, line.image.url) : '',
				unit_price: toAgentPrice(line.unitPrice),
			};
	return {
		id: line.id,
		item: {
			id: line.variantId,
			title: compact ? clipText(line.productTitle, PAGE_TITLE_CHARACTERS) : line.productTitle,
			variant_title: compact ? clipText(line.variantTitle, PAGE_VARIANT_LIMIT) : line.variantTitle,
			...details,
		},
		quantity: line.quantity,
		line_price: toAgentPrice(line.totalPrice),
	};
}

/**
 * A cart as a tool result: the view and a sentence that says what it holds.
 *
 * @param options.prefix Words before the sentence, such as "Nothing changed.".
 * @param options.notes Whether the text repeats the provider's messages, for the result of a change.
 * @param options.window The lines asked for. On a page the result shows as many of them as fit
 * `PAGE_RESULT_CHARACTERS`, at least one, so a cart of any length always fits, and says where to read on.
 */
export function cartResult(
	cart: Cart | null,
	context: StoreToolContext,
	options: { messages?: CartViewMessage[]; prefix?: string; notes?: boolean; window?: CartWindow } = {},
): StoreToolResult {
	const { messages = [], prefix = '', notes = false, window = {} } = options;
	const build = (limit: number | undefined, maxMessages: number) => {
		const view = cartView(cart, context, messages, { ...window, limit }, maxMessages);
		const said =
			notes && maxMessages > 0 ? (cart?.messages ?? []).map((message) => ` ${message.content}`).join('') : '';
		const text = `${prefix}${describeCart(view)}${context.surface === 'page' ? clipText(said, PAGE_MESSAGE_LIMIT) : said}`;
		return ok(view, text);
	};
	if (context.surface !== 'page') return build(undefined, PAGE_MESSAGES);
	let limit = Math.min(window.limit ?? Number.POSITIVE_INFINITY, cart?.lines.length ?? 0);
	let result = build(limit, PAGE_MESSAGES);
	while (limit > 1 && resultSize(result) > PAGE_RESULT_CHARACTERS) {
		limit -= 1;
		result = build(limit, PAGE_MESSAGES);
	}
	for (let kept = PAGE_MESSAGES - 1; kept >= 0 && resultSize(result) > PAGE_RESULT_CHARACTERS; kept -= 1) {
		result = build(limit, kept);
	}
	return result;
}

export function ok(structured: Record<string, unknown>, text: string): StoreToolResult {
	return { content: [{ type: 'text', text }], structuredContent: structured };
}

export function fail(message: string, structured: Record<string, unknown> = { error: message }): StoreToolOutcome {
	return {
		result: {
			content: [{ type: 'text', text: `Error: ${message}` }],
			structuredContent: structured,
			isError: true,
		},
	};
}

export function describeCart(
	cart: ReturnType<typeof cartView> & { line_count?: number; has_more?: boolean; next_offset?: number },
): string {
	if (!cart.item_count) return 'The cart is empty.';
	const lines = cart.line_items.map(
		(line) =>
			`${line.quantity} x ${describeLine({ productTitle: line.item.title, variantTitle: line.item.variant_title })}`,
	);
	const more =
		cart.has_more && cart.next_offset !== undefined
			? ` ${cart.line_count} lines in all; get_cart with offset ${cart.next_offset} shows the rest.`
			: '';
	return `The cart holds ${cart.item_count} item(s): ${lines.join(', ')}. Subtotal ${cart.total_price?.display}.${more}`;
}

/**
 * Turns plain text into escaped HTML paragraphs, for the `description.html` field Shopify's tools return.
 */
export function textToHtml(text: string): string {
	const escape = (value: string) =>
		value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
	return text
		.split(/\n\s*\n/u)
		.filter(Boolean)
		.map((paragraph) => `<p>${escape(paragraph)}</p>`)
		.join('');
}

/* Helpers that read the catalog and the cart. */

export function productHandleFrom(id: string | undefined, context: StoreToolContext): string | undefined {
	if (!id) return context.currentProductHandle;
	return productHandleFromPath(id) ?? id;
}

export function matches(variant: ProductVariant, selected: SelectedOption[]): boolean {
	return selected.every((option) =>
		variant.selectedOptions.some(
			(own) =>
				own.name.toLowerCase() === option.name.toLowerCase() &&
				own.value.toLowerCase() === option.value.toLowerCase(),
		),
	);
}

/**
 * Finds the cart a call acts on, or explains why it cannot.
 *
 * @remarks
 * On a page the cart is the shopper's, from the cookie; an `id` the agent sends is compared with its revision, so an
 * agent holding an old cart result cannot overwrite a cart the shopper has changed since. Over `/mcp` the `id` names
 * it.
 */
export async function currentCart(
	id: string | undefined,
	context: StoreToolContext,
): Promise<{ cart: Cart | null; mismatch: boolean }> {
	if (context.surface === 'mcp') return { cart: id ? await context.provider.getCart(id) : null, mismatch: false };
	const cart = context.cartId ? await context.provider.getCart(context.cartId) : null;
	return { cart, mismatch: Boolean(id) && (!cart || id !== cartRevision(cart)) };
}

export function cartOutcome(cart: Cart, context: StoreToolContext): StoreToolOutcome {
	return { result: cartResult(cart, context, { notes: true }), cartId: cart.id, cart };
}

export async function applyCartChange(change: () => Promise<Cart>): Promise<Cart | StoreToolOutcome> {
	try {
		return await change();
	} catch (error) {
		if (error instanceof CartInputError) return fail(error.message);
		throw error;
	}
}

export const isOutcome = (value: Cart | StoreToolOutcome): value is StoreToolOutcome => 'result' in value;

/**
 * The quantity changes an `update_cart` call asks for: each listed line at its quantity, where `0` removes it. A line
 * the call does not list is not touched, so a cart read a page at a time can be changed a page at a time.
 */
export function changedQuantities(lines: Array<{ item: { id: string }; quantity: number }>) {
	return lines.map((line) => ({ variantId: line.item.id, quantity: line.quantity }));
}

/**
 * What is wrong with the lines a `create_cart` or `update_cart` call lists: a variant listed twice, or a line id that no longer holds
 * the listed item because the cart changed since the agent read it.
 */
export function lineProblem(
	lines: Array<{ id?: string; item: { id: string } }>,
	cart: Cart | null,
): { kind: 'repeated' | 'stale'; message: string } | undefined {
	const variants = lines.map((line) => line.item.id);
	const repeated = variants.find((variant, index) => variants.indexOf(variant) !== index);
	if (repeated)
		return { kind: 'repeated', message: `cart.line_items lists ${repeated} twice. List each variant once.` };
	const known = new Map(cart?.lines.map((line) => [line.id, line.variantId]));
	const unknown = lines.find((line) => line.id && known.get(line.id) !== line.item.id);
	return unknown
		? { kind: 'stale', message: `Line ${unknown.id} no longer holds that item. Read the cart again with get_cart.` }
		: undefined;
}

/**
 * The words of a query worth matching: lower case, three letters or more, without common question words.
 */
export function searchTerms(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

/**
 * Scores a policy paragraph by how many of the question's words it contains.
 */
export function relevance(paragraph: string, terms: string[]): number {
	const text = paragraph.toLowerCase();
	return terms.filter((term) => text.includes(term)).length;
}

const STOP_WORDS = new Set([
	'what',
	'your',
	'you',
	'the',
	'and',
	'for',
	'how',
	'can',
	'are',
	'does',
	'with',
	'this',
	'that',
	'there',
	'about',
	'have',
	'offer',
]);
