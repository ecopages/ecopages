import { describe, expect, test } from 'vitest';
import { formatErrorChain } from './format-error-chain.ts';

describe('formatErrorChain', () => {
	test('formats an error without a cause as its own stack', () => {
		const error = new Error('plain');

		expect(formatErrorChain(error)).toBe(error.stack);
	});

	test('appends the stack of every cause', () => {
		const root = new Error('root failure');
		const middle = new Error('middle failure', { cause: root });
		const outer = new Error('outer failure', { cause: middle });

		expect(formatErrorChain(outer)).toBe(`${outer.stack}\nCaused by: ${middle.stack}\nCaused by: ${root.stack}`);
	});

	test('formats a non-error cause as text', () => {
		const error = new Error('outer', { cause: 'plain reason' });

		expect(formatErrorChain(error)).toBe(`${error.stack}\nCaused by: plain reason`);
	});

	test('stops at a circular cause', () => {
		const first = new Error('first');
		const second = new Error('second', { cause: first });
		first.cause = second;

		expect(formatErrorChain(first)).toBe(`${first.stack}\nCaused by: ${second.stack}`);
	});
});
