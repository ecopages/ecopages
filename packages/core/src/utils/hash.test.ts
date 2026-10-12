import { describe, expect, it } from 'vitest';
import { rapidhash } from './hash.ts';

describe('rapidhash', () => {
	it('pins a fixed path to one component id', () => {
		expect(rapidhash('src/components/counter.tsx').toString(36)).toBe('3t2taztysyhkd');
	});
});
