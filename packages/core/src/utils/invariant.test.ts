import { describe, expect, test } from 'vitest';
import { invariant } from './invariant.ts';

describe('invariant', () => {
	test('should not throw an error when the condition is true', () => {
		expect(() => {
			invariant(true);
		}).not.toThrow();
	});

	test('should throw an error with the default message when the condition is false', () => {
		expect(() => {
			invariant(false);
		}).toThrowError('[ecopages] An error occurred');
	});

	test('should throw an error with the provided message when the condition is false', () => {
		expect(() => {
			invariant(false, 'Custom error message');
		}).toThrowError('[ecopages] Custom error message');
	});

	test('should keep the provided cause on the thrown error', () => {
		const cause = new Error('original');

		expect.assertions(1);
		try {
			invariant(false, 'Wrapped', { cause });
		} catch (error) {
			expect((error as Error).cause).toBe(cause);
		}
	});
});
