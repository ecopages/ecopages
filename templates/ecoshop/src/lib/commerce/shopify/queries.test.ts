import { describe, expect, it } from 'vitest';
import * as queries from './queries';

const documents: Array<[string, string]> = [
	...Object.entries(queries).flatMap(([name, value]): Array<[string, string]> =>
		typeof value === 'string' ? [[name, value]] : [],
	),
	['cartChangeMutation(all)', queries.cartChangeMutation(['add', 'update', 'remove'])],
	['cartChangeMutation(remove)', queries.cartChangeMutation(['remove'])],
];

describe('Storefront API documents', () => {
	it.each(documents)('%s defines each fragment it spreads exactly once', (_name, document) => {
		const defined = [...document.matchAll(/fragment (\w+) on/gu)].map((match) => match[1]);
		const spread = new Set([...document.matchAll(/\.\.\.(\w+)/gu)].map((match) => match[1]));
		spread.delete('on');

		expect(new Set(defined).size).toBe(defined.length);
		expect([...spread].sort()).toEqual([...new Set(defined)].sort());
	});

	it('declares only the variables of the cart changes it carries', () => {
		const document = queries.cartChangeMutation(['remove']);

		expect(document).toContain('$remove: [ID!]!');
		expect(document).not.toContain('$add');
		expect(document).toMatch(/remove: cartLinesRemove/u);
	});

	it('selects the whole cart only in the last field', () => {
		const document = queries.cartChangeMutation(['update', 'remove']);
		const update = document.slice(
			document.indexOf('update: cartLinesUpdate'),
			document.indexOf('remove: cartLinesRemove'),
		);

		expect(update).toMatch(/cart \{\s*id\s*\}/u);
		expect(update).not.toContain('...CartFields');
		expect(document.slice(document.indexOf('remove: cartLinesRemove'))).toContain('...CartFields');
	});
});
