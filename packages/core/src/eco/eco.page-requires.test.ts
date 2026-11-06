import { describe, expect, expectTypeOf, test } from 'vitest';
import { eco } from './eco.ts';

declare module '../types/contracts.ts' {
	interface RequestLocals {
		requiresA?: { label: string } | null;
		requiresB?: { count: number } | null;
	}
}

type Element = string;

describe('eco.page requires narrowing', () => {
	test('narrows requested locals when no type arguments are written', () => {
		eco.page({
			requires: ['requiresA'],
			render: ({ locals }) => {
				expectTypeOf(locals.requiresA).toEqualTypeOf<{ label: string }>();
				expectTypeOf(locals.requiresB).toEqualTypeOf<{ count: number } | null | undefined>();
				return '';
			},
		});
		expect(true).toBe(true);
	});

	test('narrows only requested locals when Props, Element and keys are written', () => {
		eco.page<{}, Element, 'requiresA'>({
			requires: ['requiresA'],
			render: ({ locals }) => {
				expectTypeOf(locals.requiresA).toEqualTypeOf<{ label: string }>();
				expectTypeOf(locals.requiresB).toEqualTypeOf<{ count: number } | null | undefined>();
				return '';
			},
		});
		expect(true).toBe(true);
	});

	test('rejects requires when only Props and Element are written instead of silently losing narrowing', () => {
		// @ts-expect-error requires needs the key type argument once Props and Element are written
		eco.page<{}, Element>({
			requires: ['requiresA'],
			render: () => '',
		});
		expect(true).toBe(true);
	});
});
