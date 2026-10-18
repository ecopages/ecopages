import { describe, expect, it } from 'vitest';
import { contentHash } from './content-hash.ts';

describe('contentHash', () => {
	it('returns a full SHA-256 hex digest by default', () => {
		expect(contentHash('src/components/counter.tsx')).toBe(
			'fa63b398d075816d5d5b5082efff364546d0b7428b32f897280eb3ee78e3fe71',
		);
	});

	it('returns the requested digest prefix', () => {
		expect(contentHash('src/components/counter.tsx', 16)).toBe('fa63b398d075816d');
	});

	it('keeps the former 64-bit SHA-256 identifier when formatted in base 36', () => {
		expect(BigInt(`0x${contentHash('src/components/counter.tsx', 16)}`).toString(36)).toBe('3t2taztysyhkd');
	});

	it('hashes bytes with the same digest as their text encoding', () => {
		expect(contentHash(Buffer.from('ecopages'))).toBe(contentHash('ecopages'));
	});

	it.each([0, -1, 65, 1.5])('rejects invalid digest lengths: %s', (length) => {
		expect(() => contentHash('ecopages', length)).toThrow(RangeError);
	});
});
