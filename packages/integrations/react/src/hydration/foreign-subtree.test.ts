import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { eco } from '@ecopages/core';
import { getForeignSubtreeKey } from './foreign-subtree.ts';

const LitCounter = eco.component<Record<string, unknown>, string>({
	identity: { id: 'lit-counter', file: 'src/lit-counter.lit.tsx', integration: 'lit' },
	render: () => '',
});
const LitBadge = eco.component<Record<string, unknown>, string>({
	identity: { id: 'lit-badge', file: 'src/lit-badge.lit.tsx', integration: 'lit' },
	render: () => '',
});

describe('getForeignSubtreeKey', () => {
	it('tells Foreign Subtrees apart by Component and props, whatever the prop order', () => {
		expect(getForeignSubtreeKey(LitCounter, { count: 1 })).not.toBe(getForeignSubtreeKey(LitCounter, { count: 2 }));
		expect(getForeignSubtreeKey(LitCounter, { count: 1 })).not.toBe(getForeignSubtreeKey(LitBadge, { count: 1 }));
		expect(getForeignSubtreeKey(LitCounter, { count: 1, label: 'a', nested: { x: 1, y: [1, 2] } })).toBe(
			getForeignSubtreeKey(LitCounter, { nested: { y: [1, 2], x: 1 }, label: 'a', count: 1 }),
		);
	});

	it('leaves out props whose browser value differs from the server one', () => {
		expect(
			getForeignSubtreeKey(LitCounter, {
				count: 1,
				onClick: () => undefined,
				icon: Symbol('icon'),
				children: createElement('span', null, 'child'),
			}),
		).toBe(getForeignSubtreeKey(LitCounter, { count: 1 }));
	});
});
