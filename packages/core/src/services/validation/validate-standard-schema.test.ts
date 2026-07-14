import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { SchemaError, validateStandardSchema } from './validate-standard-schema.ts';

const schema = z.object({
	title: z.string(),
	order: z.coerce.number().optional(),
});

describe('validateStandardSchema', () => {
	test('returns validated value on success', async () => {
		const value = await validateStandardSchema(schema, { title: 'Intro', order: '1' });
		expect(value).toEqual({ title: 'Intro', order: 1 });
	});

	test('throws SchemaError on failure', async () => {
		await expect(validateStandardSchema(schema, { order: 1 })).rejects.toBeInstanceOf(SchemaError);
	});
});
