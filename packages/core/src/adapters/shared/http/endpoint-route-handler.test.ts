import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../../errors/http-error.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { RouteMatch } from '../../../router/server/route-registry.ts';
import type { RenderContext } from '../../../types/contracts.ts';
import { ApiRequestPipeline } from './api-request-pipeline.ts';
import { defineGet } from './define-api-handler.ts';
import { EndpointRouteHandler, findExplicitRoutesOnEndpoints } from './endpoint-route-handler.ts';

const match: RouteMatch = {
	requestedPathname: '/posts/7',
	templateRoute: { pathname: '/posts/[id]', kind: 'dynamic', role: 'endpoint', filePath: '/app/posts/[id].api.ts' },
	params: { id: '7' },
	query: {},
};

function createHandler(module: Record<string, unknown>) {
	return new EndpointRouteHandler({
		apiRequestPipeline: new ApiRequestPipeline({
			getRenderContext: () => ({}) as RenderContext,
			getCacheService: () => null,
		}),
		importServerModule: async () => module,
	});
}

describe('EndpointRouteHandler', () => {
	it('keeps the status of an HttpError when no app.onError handler is registered', async () => {
		const handler = createHandler({
			GET: defineGet({
				handler: () => {
					throw HttpError.NotFound('No post');
				},
			}),
		});

		const response = await handler.handleMatch(match, new Request('http://localhost/posts/7'), {});

		expect(response.status).toBe(404);
	});

	it('answers a load error with a logged 500 when no app.onError handler is registered', async () => {
		const error = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const handler = createHandler({});

		const response = await handler.handleMatch(match, new Request('http://localhost/posts/7'), {});

		expect(response.status).toBe(500);
		expect(String(error.mock.calls[0]?.[1])).toContain('/app/posts/[id].api.ts defines the endpoint "/posts/[id]"');
	});
});

describe('findExplicitRoutesOnEndpoints', () => {
	const routes = [
		{ pathname: '/blog/[slug]/comments', filePath: '/app/blog/[slug]/comments.api.ts', role: 'endpoint' as const },
		{ pathname: '/docs/[...path]', filePath: '/app/docs/[...path].api.ts', role: 'endpoint' as const },
		{ pathname: '/about', filePath: '/app/about.tsx', role: 'page' as const },
	];

	it.each([
		{ path: '/blog/:slug/comments', file: '/app/blog/[slug]/comments.api.ts' },
		{ path: '/blog/[id]/comments', file: '/app/blog/[slug]/comments.api.ts' },
		{ path: '/docs/*', file: '/app/docs/[...path].api.ts' },
		{ path: '/docs/[...rest]', file: '/app/docs/[...path].api.ts' },
	])('treats $path as the pathname of $file', ({ path, file }) => {
		const [warning] = findExplicitRoutesOnEndpoints([{ method: 'POST', path }], routes);

		expect(warning).toContain(`POST ${path}`);
		expect(warning).toContain(file);
	});

	it.each(['/blog/:slug', '/blog/:slug/comments/:id', '/docs/:path', '/about'])('does not warn for %s', (path) => {
		expect(findExplicitRoutesOnEndpoints([{ method: 'GET', path }], routes)).toEqual([]);
	});
});
