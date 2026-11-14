import { describe, expect, it } from 'vitest';
import { isNodeBuiltinSpecifier } from './node-builtin.ts';

describe('isNodeBuiltinSpecifier', () => {
	it('treats prefixed and unprefixed built-ins alike, subpaths included', () => {
		for (const specifier of ['node:fs', 'fs', 'fs/promises', 'node:fs/promises', 'path']) {
			expect(isNodeBuiltinSpecifier(specifier)).toBe(true);
		}
	});

	it('does not treat packages named like a built-in as built-ins', () => {
		for (const specifier of ['path-browserify', 'fs-extra', 'react', './fs']) {
			expect(isNodeBuiltinSpecifier(specifier)).toBe(false);
		}
	});
});
