import { describe, expect, test } from 'vitest';
import { validateToolInput, type ToolInputSchema } from './tool-schema.ts';

const schema: ToolInputSchema = {
	type: 'object',
	properties: {
		query: { type: 'string', description: 'Words to find', minLength: 2, maxLength: 10 },
		limit: { type: 'integer', description: 'How many', minimum: 1, maximum: 5 },
		open: { type: 'boolean', description: 'Open it' },
	},
	required: ['query'],
	additionalProperties: false,
};

describe('validateToolInput', () => {
	test('accepts valid input and keeps its values', () => {
		expect(validateToolInput(schema, { query: 'chair', limit: 3, open: true })).toEqual({
			ok: true,
			value: { query: 'chair', limit: 3, open: true },
		});
	});

	test('accepts the input as a JSON string, as some agents send it', () => {
		expect(validateToolInput(schema, '{"query":"lamp"}')).toEqual({ ok: true, value: { query: 'lamp' } });
	});

	test.each([
		['a missing required field', {}, /^query: /u],
		['a string that is too short', { query: 'a' }, /^query: .*2/u],
		['a string that is too long', { query: 'abcdefghijk' }, /^query: .*10/u],
		['a number where a string belongs', { query: 5 }, /^query: /u],
		['a fractional integer', { query: 'chair', limit: 1.5 }, /^limit: /u],
		['an integer out of range', { query: 'chair', limit: 9 }, /^limit: .*1.*5/u],
		['a string where a boolean belongs', { query: 'chair', open: 'yes' }, /^open: /u],
		['an unknown field', { query: 'chair', color: 'red' }, /^color: /u],
	])('rejects %s, naming the field', (_, input, message) => {
		const result = validateToolInput(schema, input);

		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.error).toMatch(message);
	});

	test.each([
		['null', null],
		['an array', []],
		['malformed JSON', '{'],
	])('rejects %s as input', (_, input) => {
		expect(validateToolInput(schema, input)).toEqual({ ok: false, error: 'input: expected an object' });
	});
});
