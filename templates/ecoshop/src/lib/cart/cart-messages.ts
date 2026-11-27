import { type Cart, type CartLine, DEFAULT_VARIANT_TITLE, MAX_LINE_QUANTITY } from '../commerce/types';

/**
 * A cart line as a sentence names it: the product, and the variant unless it is the only one.
 */
export function describeLine(line: Pick<CartLine, 'productTitle' | 'variantTitle'>): string {
	return line.variantTitle === DEFAULT_VARIANT_TITLE
		? line.productTitle
		: `${line.productTitle} (${line.variantTitle})`;
}

/**
 * The sentence that tells a shopper or an agent that a cart line holds fewer than the change asked for.
 *
 * @remarks
 * The Storefront API caps a quantity at the stock it has and reports it as a warning, not an error, so the change
 * succeeds with less than was asked. The provider words the message with it for the toast and the agent tools, and the
 * cart page words the same sentence from the cart it reads, so the shopper hears the same thing on every surface.
 */
export function describeShortage(title: string, available: number, wanted: number): string {
	return `${title}: only ${available} in stock, so the cart holds ${available} instead of ${wanted}.`;
}

/**
 * The codes the cart page reads from `?notice=` after a form post without JavaScript: `invalid` when the post failed
 * its schema, `refused` when the provider would not make the change, `short` when it left a line holding fewer than
 * asked.
 */
export type CartNotice = 'invalid' | 'refused' | 'short';

const STATUS_NOTICES = {
	invalid: `That cart change was not valid. Choose a variant and a quantity from 1 to ${MAX_LINE_QUANTITY}.`,
	refused: 'That item could not be added. It may be sold out.',
} as const satisfies Partial<Record<CartNotice, string>>;

/**
 * The sentence the cart page shows for `?notice=invalid` and `?notice=refused`, or `null` for any other code;
 * `short` words its own with {@link shortageNotice}.
 */
export function statusNotice(query: Record<string, unknown>): string | null {
	const code = query.notice;
	return typeof code === 'string' && Object.hasOwn(STATUS_NOTICES, code)
		? STATUS_NOTICES[code as keyof typeof STATUS_NOTICES]
		: null;
}

/**
 * The query the cart form's redirect carries for a notice.
 */
export function noticeQuery(notice: CartNotice): string {
	return new URLSearchParams({ notice }).toString();
}

/**
 * The query the cart form's redirect carries when a change left a line short: which variant, and how many the change
 * asked the cart to hold.
 */
export function shortageQuery(variantId: string, wanted: number): string {
	return new URLSearchParams({
		notice: 'short' satisfies CartNotice,
		line: variantId,
		wanted: String(wanted),
	}).toString();
}

/**
 * The shortage message for the cart page, or `null` when the query names none that the cart still shows.
 *
 * @remarks
 * The page words the message from the cart it reads, not from text in the URL, so a crafted link can only make it say
 * what the cart really holds, and only for a line that is short.
 */
export function shortageNotice(cart: Cart | null, query: Record<string, unknown>): string | null {
	if (
		query.notice !== ('short' satisfies CartNotice) ||
		typeof query.line !== 'string' ||
		typeof query.wanted !== 'string'
	)
		return null;
	const wanted = Number(query.wanted);
	if (!Number.isInteger(wanted) || wanted < 1 || wanted > MAX_LINE_QUANTITY) return null;
	const line = cart?.lines.find((entry) => entry.variantId === query.line);
	return line && line.quantity < wanted ? describeShortage(describeLine(line), line.quantity, wanted) : null;
}
