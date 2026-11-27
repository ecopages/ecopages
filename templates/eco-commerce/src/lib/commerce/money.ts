import type { Money } from './types.ts';

const formats = new Map<string, Intl.NumberFormat>();

export function formatMoney({ amount, currencyCode }: Money): string {
	let format = formats.get(currencyCode);
	if (!format) {
		format = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode.toUpperCase() });
		formats.set(currencyCode, format);
	}
	return format.format(amount / 100);
}
