import { describe, expectTypeOf, it } from 'vitest';
import type classes from './card.module.css';
import type styles from './card.css';

describe('the ambient stylesheet declarations', () => {
	it('types the default import of a CSS Module as a readonly map of class names', () => {
		expectTypeOf<typeof classes>().toEqualTypeOf<{ readonly [key: string]: string }>();
		expectTypeOf<(typeof classes)['primary']>().toEqualTypeOf<string>();
	});

	it('keeps a plain stylesheet import a string', () => {
		expectTypeOf<typeof styles>().toEqualTypeOf<string>();
	});
});
