/**
 * The types, result views and helpers the store tools share, in the shapes Shopify's storefront tools return.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CartInputError } from '@/lib/commerce/errors';
import { type AgentPrice, toAgentPrice } from '@/lib/commerce/money';
import {
	type Cart,
	type CommerceProvider,
	DEFAULT_VARIANT_TITLE,
	type ProductSummary,
	type ProductVariant,
	type SelectedOption,
} from '@/lib/commerce/types';
import { productHandleFromPath, resolveUrl, storePaths } from '@/lib/store-urls';
import type { StoreToolDescriptor, StoreToolResult } from './agent-tool-types';

/**
 * Where a tool runs. `page` is WebMCP in the shopper's browser, acting on the shopper's cart through
 * `/api/agent-tools`; `mcp` is the `/mcp` server, where a cart is named by its id.
 */
export type ToolSurface = 'page' | 'mcp';

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

export type StoreToolAnnotations = StoreToolDescriptor['annotations'] & {
	idempotentHint?: boolean;
	destructiveHint?: boolean;
};

export interface StoreToolDefinition<Input extends z.ZodObject> {
	name: string;
	title: string;
	description: string;
	input: Input;
	annotations: StoreToolAnnotations;
	surfaces: ToolSurface[];
	/** `product` for a tool that only a product page registers; `store` (the default) for every page. */
	scope?: StoreToolDescriptor['scope'];
	/** Its only change is opening a page, which `/mcp` never does, so there it is read-only. */
	readOnlyOverMcp?: true;
	run(input: z.infer<Input>, context: StoreToolContext): Promise<StoreToolOutcome>;
}

/**
 * A tool with its input type erased, so tools of different inputs share one list. `run` parses its input.
 */
export type StoreTool = Omit<StoreToolDefinition<z.ZodObject>, 'run'> & {
	run(input: unknown, context: StoreToolContext): Promise<StoreToolOutcome>;
};

export function define<Input extends z.ZodObject>(tool: StoreToolDefinition<Input>): StoreTool {
	return { ...tool, run: (input, context) => tool.run(tool.input.parse(input), context) };
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

export type CartMessage = { type: 'error' | 'warning' | 'info'; code?: string; content: string; path?: string };

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

export function cartView(cart: Cart | null, context: StoreToolContext, messages: CartMessage[] = []) {
	const { origin } = context;
	const subtotal: AgentPrice | null = cart ? toAgentPrice(cart.subtotal) : null;
	return {
		id: cart ? (context.surface === 'page' ? cartRevision(cart) : cart.id) : '',
		item_count: cart?.totalQuantity ?? 0,
		total_price: subtotal,
		currency: cart?.subtotal.currencyCode ?? '',
		totals: subtotal ? [{ type: 'subtotal', amount: subtotal.amount }] : [],
		line_items: (cart?.lines ?? []).map((line) => ({
			id: line.id,
			item: {
				id: line.variantId,
				title: line.productTitle,
				variant_title: line.variantTitle,
				handle: line.productHandle,
				url: productUrl(origin, line.productHandle, line.variantId),
				image: line.image ? resolveUrl(origin, line.image.url) : '',
				unit_price: toAgentPrice(line.unitPrice),
			},
			quantity: line.quantity,
			line_price: toAgentPrice(line.totalPrice),
		})),
		...(messages.length ? { messages } : {}),
	};
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

export function describeCart(cart: ReturnType<typeof cartView>): string {
	if (!cart.item_count) return 'The cart is empty.';
	const lines = cart.line_items.map((line) => {
		const variant = line.item.variant_title && line.item.variant_title !== DEFAULT_VARIANT_TITLE;
		return `${line.quantity} x ${line.item.title}${variant ? ` (${line.item.variant_title})` : ''}`;
	});
	return `The cart holds ${cart.item_count} item(s): ${lines.join(', ')}. Subtotal ${cart.total_price?.display}.`;
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
	const view = cartView(cart, context);
	return { result: ok(view, describeCart(view)), cartId: cart.id, cart };
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
 * The quantity changes that make a cart hold exactly `lines`: each listed variant at its quantity, every other line
 * at zero.
 */
export function replacementQuantities(lines: Array<{ item: { id: string }; quantity: number }>, cart: Cart | null) {
	const target = new Map(lines.map((line) => [line.item.id, line.quantity]));
	for (const line of cart?.lines ?? []) if (!target.has(line.variantId)) target.set(line.variantId, 0);
	return [...target].map(([variantId, quantity]) => ({ variantId, quantity }));
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
