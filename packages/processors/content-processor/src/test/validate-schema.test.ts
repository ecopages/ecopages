import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { SchemaError, validateStandardSchema } from '@ecopages/core';
import { ContentScanner } from '../content-scanner.ts';
import { testContentSchema } from './test-schema.ts';

describe('validateStandardSchema', () => {
	test('returns validated value on success', async () => {
		const value = await validateStandardSchema(testContentSchema, {
			title: 'Intro',
			description: 'Welcome',
			order: '1',
		});
		expect(value).toEqual({ title: 'Intro', description: 'Welcome', order: 1 });
	});

	test('throws SchemaError on failure', async () => {
		await expect(validateStandardSchema(testContentSchema, { order: 1 })).rejects.toBeInstanceOf(SchemaError);
	});
});

describe('ContentScanner schema validation', () => {
	test('rejects invalid frontmatter', async () => {
		const scanner = new ContentScanner({
			contentRoot: '/tmp',
			schema: z.object({ title: z.string() }),
		});

		await expect(scanner['parseFrontmatter']('---\norder: 1\n---')).rejects.toBeInstanceOf(SchemaError);
	});
});
