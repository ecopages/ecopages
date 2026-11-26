import { describe, expect, it } from 'vitest';
import * as queries from './queries';

const documents = Object.entries(queries).flatMap(([name, value]): Array<[string, string]> =>
	typeof value === 'string' ? [[name, value]] : [],
);

describe('Storefront API documents', () => {
	it.each(documents)('%s defines each fragment it spreads exactly once', (_name, document) => {
		const defined = [...document.matchAll(/fragment (\w+) on/gu)].map((match) => match[1]);
		const spread = new Set([...document.matchAll(/\.\.\.(\w+)/gu)].map((match) => match[1]));
		spread.delete('on');

		expect(new Set(defined).size).toBe(defined.length);
		expect([...spread].sort()).toEqual([...new Set(defined)].sort());
	});
});
