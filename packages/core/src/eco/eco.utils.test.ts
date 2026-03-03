import { describe, expect, test } from 'vitest';
import { addTriggerAttribute, isThenable } from './eco.utils.ts';

const TRIGGER_ID = 'eco-trigger-abc123';

describe('addTriggerAttribute', () => {
	describe('basic element injection', () => {
		test('injects into a plain div', () => {
			const result = addTriggerAttribute('<div>content</div>', TRIGGER_ID);
			expect(result).toBe(`<div data-eco-trigger="${TRIGGER_ID}">content</div>`);
		});

		test('injects into a custom element', () => {
			const result = addTriggerAttribute('<my-counter value="0"></my-counter>', TRIGGER_ID);
			expect(result).toBe(`<my-counter data-eco-trigger="${TRIGGER_ID}" value="0"></my-counter>`);
		});

		test('injects into an element that already has attributes', () => {
			const result = addTriggerAttribute('<div class="foo" id="bar">content</div>', TRIGGER_ID);
			expect(result).toBe(`<div data-eco-trigger="${TRIGGER_ID}" class="foo" id="bar">content</div>`);
		});

		test('injects into a self-closing void element', () => {
			const result = addTriggerAttribute('<img src="x.png" alt="" />', TRIGGER_ID);
			expect(result).toBe(`<img data-eco-trigger="${TRIGGER_ID}" src="x.png" alt="" />`);
		});

		test('injects into an element with no attributes and immediate close', () => {
			const result = addTriggerAttribute('<section></section>', TRIGGER_ID);
			expect(result).toBe(`<section data-eco-trigger="${TRIGGER_ID}"></section>`);
		});
	});

	describe('leading non-element nodes are skipped', () => {
		test('skips leading whitespace and injects into the first element', () => {
			const result = addTriggerAttribute('   \n  <div>content</div>', TRIGGER_ID);
			expect(result).toBe(`   \n  <div data-eco-trigger="${TRIGGER_ID}">content</div>`);
		});

		test('skips a leading HTML comment', () => {
			const result = addTriggerAttribute('<!-- wrapper --><div>content</div>', TRIGGER_ID);
			expect(result).toBe(`<!-- wrapper --><div data-eco-trigger="${TRIGGER_ID}">content</div>`);
		});

		test('skips multiple leading HTML comments', () => {
			const result = addTriggerAttribute('<!-- a --><!-- b --><span>text</span>', TRIGGER_ID);
			expect(result).toBe(`<!-- a --><!-- b --><span data-eco-trigger="${TRIGGER_ID}">text</span>`);
		});

		test('skips a leading doctype declaration', () => {
			const result = addTriggerAttribute('<!DOCTYPE html><html lang="en"></html>', TRIGGER_ID);
			expect(result).toBe(`<!DOCTYPE html><html data-eco-trigger="${TRIGGER_ID}" lang="en"></html>`);
		});

		test('skips a leading XML processing instruction', () => {
			const result = addTriggerAttribute('<?xml version="1.0"?><root/>', TRIGGER_ID);
			expect(result).toBe(`<?xml version="1.0"?><root data-eco-trigger="${TRIGGER_ID}"/>`);
		});

		test('skips comment then whitespace then element', () => {
			const result = addTriggerAttribute('<!-- note -->\n<article>body</article>', TRIGGER_ID);
			expect(result).toBe(`<!-- note -->\n<article data-eco-trigger="${TRIGGER_ID}">body</article>`);
		});
	});

	describe('only the first element is modified', () => {
		test('does not inject into sibling elements', () => {
			const result = addTriggerAttribute('<div>first</div><div>second</div>', TRIGGER_ID);
			expect(result).toBe(`<div data-eco-trigger="${TRIGGER_ID}">first</div><div>second</div>`);
		});
	});

	describe('fallback when no element is found', () => {
		test('returns the original string unchanged when there is no opening tag', () => {
			const input = 'just some text';
			expect(addTriggerAttribute(input, TRIGGER_ID)).toBe(input);
		});

		test('returns the original string unchanged when input is empty', () => {
			expect(addTriggerAttribute('', TRIGGER_ID)).toBe('');
		});
	});

	describe('non-string input coercion', () => {
		test('coerces a number to string before injecting', () => {
			const result = addTriggerAttribute(42, TRIGGER_ID);
			expect(result).toBe('42');
		});

		test('coerces null to the string "null"', () => {
			expect(addTriggerAttribute(null, TRIGGER_ID)).toBe('null');
		});
	});
});

describe('isThenable', () => {
	test('returns true for a native Promise', () => {
		expect(isThenable(Promise.resolve())).toBe(true);
	});

	test('returns true for a plain object with a then function', () => {
		expect(isThenable({ then: () => {} })).toBe(true);
	});

	test('returns false for a plain string', () => {
		expect(isThenable('hello')).toBe(false);
	});

	test('returns false for a number', () => {
		expect(isThenable(42)).toBe(false);
	});

	test('returns false for null', () => {
		expect(isThenable(null)).toBe(false);
	});

	test('returns false for an object without then', () => {
		expect(isThenable({ value: 1 })).toBe(false);
	});

	test('returns false when then is not a function', () => {
		expect(isThenable({ then: 'not-a-function' })).toBe(false);
	});
});
