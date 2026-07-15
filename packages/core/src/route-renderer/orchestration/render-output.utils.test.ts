import { describe, expect, it } from 'vitest';
import {
	assertForeignChildrenNotOpaque,
	isOpaqueForeignChildValue,
} from './render-output.utils.ts';

describe('opaque foreign children', () => {
	it('treats plain objects as opaque and allows template and markup shapes', () => {
		expect(isOpaqueForeignChildValue({ opaque: true })).toBe(true);
		expect(isOpaqueForeignChildValue(Object.create(null))).toBe(true);
		expect(isOpaqueForeignChildValue({ strings: ['<div>', '</div>'], values: [] })).toBe(false);
		expect(isOpaqueForeignChildValue({ nodeType: 1, outerHTML: '<div></div>' })).toBe(false);
		expect(isOpaqueForeignChildValue(['a', 'b'])).toBe(false);
		expect(isOpaqueForeignChildValue({ $$typeof: Symbol.for('react.element') })).toBe(false);
		expect(isOpaqueForeignChildValue('already-serialized')).toBe(false);
	});

	it('throws a typed error for opaque foreign children', () => {
		expect(() => assertForeignChildrenNotOpaque({ opaque: true }, 'test queue')).toThrow(
			/test queue refused to coerce opaque foreign children/,
		);
		expect(() => assertForeignChildrenNotOpaque('<div></div>', 'test queue')).not.toThrow();
	});
});
