import { describe, expect, it } from 'vitest';
import {
	addTriggerAttribute,
	assertForeignChildrenNotOpaque,
	isOpaqueForeignChildValue,
} from './foreign-child-output.utils.ts';

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

describe('addTriggerAttribute', () => {
	it('adds the trigger to the first opening tag of a template', () => {
		const content = { strings: ['<div', '>', '</div>'], values: [] };

		expect(addTriggerAttribute(content, 'eco-trigger-1').strings[0]).toBe('<div data-eco-trigger="eco-trigger-1"');
	});

	it('leaves ssrIntrinsicProps alone when the template has none', () => {
		const content = { strings: ['<div', '>'], values: [] };

		expect('ssrIntrinsicProps' in addTriggerAttribute(content, 'eco-trigger-1')).toBe(false);
	});

	/**
	 * A registered custom element is rendered from `ssrIntrinsicProps` by the JSX
	 * server renderer, which never reads `strings` — so a trigger written only
	 * there is dropped and the lazy script never loads.
	 */
	it('also adds the trigger to ssrIntrinsicProps for custom-element roots', () => {
		const content = {
			strings: ['<rui-alert', '>', '</rui-alert>'],
			values: [],
			rootLocalName: 'rui-alert',
			ssrIntrinsicProps: { variant: 'info' },
		};

		const result = addTriggerAttribute(content, 'eco-trigger-2');

		expect(result.strings[0]).toBe('<rui-alert data-eco-trigger="eco-trigger-2"');
		expect(result.ssrIntrinsicProps).toEqual({ variant: 'info', 'data-eco-trigger': 'eco-trigger-2' });
	});

	it('does not mutate the original template', () => {
		const content = { strings: ['<rui-alert', '>'], values: [], ssrIntrinsicProps: { variant: 'info' } };

		addTriggerAttribute(content, 'eco-trigger-3');

		expect(content.strings[0]).toBe('<rui-alert');
		expect(content.ssrIntrinsicProps).toEqual({ variant: 'info' });
	});

	/**
	 * A component whose render returns a fragment arrives here as an array. It
	 * used to fall through to `String(content)` and serialize as `[object
	 * Object]`, silently destroying the markup.
	 */
	it("puts the trigger on a fragment's first entry and preserves the rest", () => {
		const first = { strings: ['<span', '>', '</span>'], values: [] };
		const second = { strings: ['<rui-dialog', '>'], values: [] };

		const result = addTriggerAttribute([first, second], 'eco-trigger-4') as [typeof first, typeof second];

		expect(result).toHaveLength(2);
		expect(result[0].strings[0]).toBe('<span data-eco-trigger="eco-trigger-4"');
		expect(result[1]).toBe(second);
	});

	it('keeps every fragment entry a renderable template rather than coercing it', () => {
		const result = addTriggerAttribute(
			[
				{ strings: ['<span', '>'], values: [] },
				{ strings: ['<div', '>'], values: [] },
			],
			'eco-trigger-5',
		) as Array<{ strings: string[] }>;

		expect(Array.isArray(result)).toBe(true);
		expect(result.every((entry) => Array.isArray(entry.strings))).toBe(true);
	});

	it('returns an empty fragment untouched', () => {
		const empty: unknown[] = [];

		expect(addTriggerAttribute(empty, 'eco-trigger-6')).toBe(empty);
	});
});
