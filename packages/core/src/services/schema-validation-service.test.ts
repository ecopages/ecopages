import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import * as v from 'valibot';
import { type } from 'arktype';
import { SchemaValidationService } from './schema-validation-service.ts';

describe('SchemaValidationService', () => {
	const service = new SchemaValidationService();

	describe('Zod validation', () => {
		test('validates body with Zod schema', async () => {
			const schema = z.object({
				title: z.string().min(1),
				count: z.number(),
			});

			const result = await service.validateRequest(
				{ body: { title: 'Hello', count: 42 } },
				{ body: schema as unknown as Parameters<typeof service.validateRequest>[1]['body'] },
			);

			expect(result.success).toBe(true);
			expect(result.data?.body).toEqual({ title: 'Hello', count: 42 });
		});

		test('rejects invalid body with Zod schema', async () => {
			const schema = z.object({
				title: z.string().min(1),
				count: z.number(),
			});

			const result = await service.validateRequest(
				{ body: { title: '', count: 'not-a-number' } },
				{ body: schema as unknown as Parameters<typeof service.validateRequest>[1]['body'] },
			);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(0);
		});
	});

	describe('Valibot validation', () => {
		test('validates query with Valibot schema', async () => {
			const schema = v.object({
				page: v.string(),
				limit: v.string(),
			});

			const result = await service.validateRequest(
				{ query: { page: '1', limit: '10' } },
				{ query: schema as unknown as Parameters<typeof service.validateRequest>[1]['query'] },
			);

			expect(result.success).toBe(true);
			expect(result.data?.query).toEqual({ page: '1', limit: '10' });
		});

		test('rejects invalid query with Valibot schema', async () => {
			const schema = v.object({
				page: v.pipe(v.string(), v.minLength(1)),
			});

			const result = await service.validateRequest(
				{ query: { page: '' } },
				{ query: schema as unknown as Parameters<typeof service.validateRequest>[1]['query'] },
			);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
		});
	});

	describe('ArkType validation', () => {
		test('validates headers with ArkType schema', async () => {
			const schema = type({
				'content-type': 'string',
				authorization: 'string',
			});

			const result = await service.validateRequest(
				{
					headers: {
						'content-type': 'application/json',
						authorization: 'Bearer token',
					},
				},
				{ headers: schema as unknown as Parameters<typeof service.validateRequest>[1]['headers'] },
			);

			expect(result.success).toBe(true);
			expect(result.data?.headers).toEqual({
				'content-type': 'application/json',
				authorization: 'Bearer token',
			});
		});

		test('rejects invalid headers with ArkType schema', async () => {
			const schema = type({
				'content-type': 'string',
				'x-custom': 'string>5',
			});

			const result = await service.validateRequest(
				{
					headers: {
						'content-type': 'application/json',
						'x-custom': 'ab',
					},
				},
				{ headers: schema as unknown as Parameters<typeof service.validateRequest>[1]['headers'] },
			);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
		});
	});

	describe('Combined validation', () => {
		test('validates multiple sources at once', async () => {
			const bodySchema = z.object({
				title: z.string(),
			});
			const querySchema = v.object({
				format: v.string(),
			});

			const result = await service.validateRequest(
				{
					body: { title: 'Post Title' },
					query: { format: 'json' },
				},
				{
					body: bodySchema as unknown as Parameters<typeof service.validateRequest>[1]['body'],
					query: querySchema as unknown as Parameters<typeof service.validateRequest>[1]['query'],
				},
			);

			expect(result.success).toBe(true);
			expect(result.data?.body).toEqual({ title: 'Post Title' });
			expect(result.data?.query).toEqual({ format: 'json' });
		});

		test('aggregates errors from multiple sources', async () => {
			const bodySchema = z.object({
				title: z.string().min(5),
			});
			const querySchema = v.object({
				page: v.pipe(v.string(), v.regex(/^\d+$/)),
			});

			const result = await service.validateRequest(
				{
					body: { title: 'ab' },
					query: { page: 'invalid' },
				},
				{
					body: bodySchema as unknown as Parameters<typeof service.validateRequest>[1]['body'],
					query: querySchema as unknown as Parameters<typeof service.validateRequest>[1]['query'],
				},
			);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(1);
		});
	});

	describe('Edge cases', () => {
		test('handles missing optional schemas', async () => {
			const result = await service.validateRequest({ body: { data: 'test' } }, {});

			expect(result.success).toBe(true);
			expect(result.data).toEqual({});
		});

		test('handles undefined source data', async () => {
			const schema = z.object({ name: z.string() });

			const result = await service.validateRequest(
				{ body: undefined },
				{ body: schema as unknown as Parameters<typeof service.validateRequest>[1]['body'] },
			);

			expect(result.success).toBe(true);
		});

		test('catches validation exceptions', async () => {
			const brokenSchema = {
				'~standard': {
					version: 1,
					vendor: 'test',
					validate: () => {
						throw new Error('Validation crashed');
					},
				},
			} as const;

			const result = await service.validateRequest({ body: { test: true } }, { body: brokenSchema });

			expect(result.success).toBe(false);
			expect(result.errors?.[0]?.message).toBe('Validation crashed');
		});
	});
});
