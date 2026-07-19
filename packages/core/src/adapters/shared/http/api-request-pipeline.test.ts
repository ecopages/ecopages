import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SchemaValidationService } from '../../../services/validation/schema-validation-service.ts';
import type { ApiHandler, RenderContext } from '../../../types/public-types.ts';
import { ApiRequestPipeline } from './api-request-pipeline.ts';

function createPipeline() {
	return new ApiRequestPipeline({
		schemaValidator: new SchemaValidationService(),
		getRenderContext: () =>
			({
				render: vi.fn(),
			}) as unknown as RenderContext,
		getCacheService: () => null,
	});
}

describe('ApiRequestPipeline', () => {
	it('returns null from tryHandle when no route matches', async () => {
		const pipeline = createPipeline();
		const response = await pipeline.tryHandle(new Request('http://localhost/api/missing'), [], undefined);
		expect(response).toBeNull();
	});

	it('returns null when method does not match', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts',
				method: 'POST',
				handler: () => new Response('created'),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts', { method: 'GET' }),
			handlers,
			undefined,
		);
		expect(response).toBeNull();
	});

	it('matches path params and executes the handler', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts/[id]',
				method: 'GET',
				handler: ({ params }) => new Response(`id:${params.id}`),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts/42', { method: 'GET' }),
			handlers,
			undefined,
		);

		expect(response).not.toBeNull();
		expect(response!.status).toBe(200);
		expect(await response!.text()).toBe('id:42');
	});

	it('returns a validation error response when schema fails', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts',
				method: 'POST',
				schema: {
					body: z.object({ title: z.string().min(1) }),
				},
				handler: () => new Response('ok'),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: '' }),
			}),
			handlers,
			undefined,
		);

		expect(response).not.toBeNull();
		expect(response!.status).toBe(400);
		const payload = (await response!.json()) as { error: string };
		expect(payload.error).toBe('Validation failed');
	});

	it('runs middleware before the handler', async () => {
		const pipeline = createPipeline();
		const order: string[] = [];
		const handlers: ApiHandler[] = [
			{
				path: '/api/secure',
				method: 'GET',
				middleware: [
					async (_ctx, next) => {
						order.push('middleware');
						return next();
					},
				],
				handler: async () => {
					order.push('handler');
					return new Response('done');
				},
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/secure', { method: 'GET' }),
			handlers,
			undefined,
		);

		expect(await response!.text()).toBe('done');
		expect(order).toEqual(['middleware', 'handler']);
	});
});
