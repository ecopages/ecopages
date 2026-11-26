import type { Money } from './types';

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats an amount for display, such as `$68.00`.
 */
export function formatMoney(money: Money, locale = 'en-US'): string {
	const key = `${locale}:${money.currencyCode}`;
	let formatter = formatters.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currencyCode });
		formatters.set(key, formatter);
	}
	return formatter.format(Number(money.amount));
}

/**
 * Formats a price range as one price, or as `from $24.00` when variants differ.
 */
export function formatPriceRange(range: { min: Money; max: Money }, locale = 'en-US'): string {
	const min = formatMoney(range.min, locale);
	return range.min.amount === range.max.amount ? min : `from ${min}`;
}

/**
 * Converts a decimal amount string to integer cents.
 *
 * @remarks
 * Only the demo provider computes totals, and its catalog has two-decimal prices. A Shopify cart's totals come from
 * the Storefront API, never from this arithmetic.
 */
export function toCents(amount: string): number {
	return Math.round(Number(amount) * 100);
}

export function fromCents(cents: number, currencyCode: string): Money {
	return { amount: (cents / 100).toFixed(2), currencyCode };
}
