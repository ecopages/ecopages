import { describe, expect, it } from 'vitest';
import { assertForeignChildrenNotOpaque } from './foreign-child-output.utils.ts';

describe('opaque foreign children', () => {
	it('refuses plain objects and allows template, markup, array, element and string shapes', () => {
		expect(() => assertForeignChildrenNotOpaque({ opaque: true }, 'test')).toThrow(TypeError);
		expect(() => assertForeignChildrenNotOpaque(Object.create(null), 'test')).toThrow(TypeError);
		expect(() =>
			assertForeignChildrenNotOpaque({ strings: ['<div>', '</div>'], values: [] }, 'test'),
		).not.toThrow();
		expect(() => assertForeignChildrenNotOpaque({ nodeType: 1, outerHTML: '<div></div>' }, 'test')).not.toThrow();
		expect(() => assertForeignChildrenNotOpaque(['a', 'b'], 'test')).not.toThrow();
		expect(() => assertForeignChildrenNotOpaque({ $$typeof: Symbol.for('react.element') }, 'test')).not.toThrow();
		expect(() => assertForeignChildrenNotOpaque('already-serialized', 'test')).not.toThrow();
	});

	it('throws a typed error for opaque foreign children', () => {
		expect(() => assertForeignChildrenNotOpaque({ opaque: true }, 'test queue')).toThrow(
			/test queue refused to coerce opaque foreign children/,
		);
		expect(() => assertForeignChildrenNotOpaque('<div></div>', 'test queue')).not.toThrow();
	});
});
