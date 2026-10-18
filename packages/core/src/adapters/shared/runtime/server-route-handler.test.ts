import { describe, expect, it, vi } from 'vitest';
import { ServerRouteHandler } from './server-route-handler';
import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { ExplicitStaticRouteMatcher } from '../http/explicit-static-route-matcher.ts';
import type { FileSystemResponseMatcher } from '../http/fs-server-response-matcher.ts';
import type { IHmrManager } from '../../../types/contracts.ts';
import { HttpError } from '../../../errors/http-error.ts';

function createMockDependencies() {
	const HmrManager = {
		isEnabled: vi.fn(() => true),
		broadcast: vi.fn(),
	} as unknown as IHmrManager;

	const Router = {
		matchRequest: vi.fn(() => null),
		origin: 'http://localhost:3000',
		appConfig: {
			appRuntime: {
				hmr: HmrManager,
			},
		},
	} as unknown as RouteRegistry;

	const FileSystemResponseMatcher = {
		handleMatch: vi.fn(() => Promise.resolve(new Response('Matched Content'))),
		handleNoMatch: vi.fn(() => Promise.resolve(new Response('Not Found', { status: 404 }))),
		renderServerError: vi.fn(() => Promise.resolve(new Response('Internal Server Error', { status: 500 }))),
	} as unknown as FileSystemResponseMatcher;

	return {
		Router,
		FileSystemResponseMatcher,
		HmrManager,
	};
}

describe('ServerRouteHandler', () => {
	describe('handleResponse', () => {
		it('keeps dotted Page paths routable and sends known static extensions to the fallback', async () => {
			const { Router, FileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
			});
			const routeMatch = {
				requestedPathname: '/v1.2',
				templateRoute: { pathname: '/v1.2', kind: 'exact', filePath: '/src/pages/v1.2.tsx' },
				params: {},
				query: {},
			} satisfies NonNullable<ReturnType<RouteRegistry['matchRequest']>>;
			const matchRequest = vi.spyOn(Router, 'matchRequest').mockReturnValueOnce(routeMatch);

			const routeRequest = new Request('http://localhost/v1.2');
			const routeResponse = await handler.handleResponse(routeRequest);
			expect(routeResponse.status).toBe(200);
			expect(await routeResponse.text()).toBe('Matched Content');
			expect(matchRequest).toHaveBeenCalledExactlyOnceWith('http://localhost/v1.2', ['v1.2']);
			expect(FileSystemResponseMatcher.handleMatch).toHaveBeenCalledExactlyOnceWith(routeMatch, routeRequest);

			const assetRequest = new Request('http://localhost/assets/app.js', {
				headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': '"asset-etag"' },
			});
			const assetResponse = await handler.handleResponse(assetRequest);

			expect(assetResponse.status).toBe(404);
			expect(await assetResponse.text()).toBe('Not Found');
			expect(matchRequest).toHaveBeenCalledOnce();
			expect(FileSystemResponseMatcher.handleNoMatch).toHaveBeenCalledWith('/assets/app.js', assetRequest);
		});

		it.each([
			{
				name: 'a generic error',
				url: 'http://localhost/boom',
				path: '/boom',
				error: new Error('Intentional server error'),
			},
			{
				name: 'HttpError.NotFound',
				url: 'http://localhost/posts/missing',
				path: '/posts/missing',
				error: HttpError.NotFound('Post not found'),
			},
		])('renders a server error when an explicit static route throws $name', async ({ url, path, error }) => {
			const { Router, FileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
				explicitStaticRouteMatcher: {
					match: vi.fn(() => ({ route: { path, loader: vi.fn() }, params: {} })),
					handleMatch: vi.fn(async () => {
						throw error;
					}),
				} as unknown as ExplicitStaticRouteMatcher,
			});

			await handler.handleResponse(new Request(url));

			expect(FileSystemResponseMatcher.handleMatch).not.toHaveBeenCalled();
			expect(FileSystemResponseMatcher.renderServerError).toHaveBeenCalledWith(new URL(url).pathname, error);
		});
	});

	describe('handleNoMatch', () => {
		it('should broadcast error if handleNoMatch throws', async () => {
			const { Router, FileSystemResponseMatcher, HmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
			});

			FileSystemResponseMatcher.handleNoMatch = vi.fn(() => {
				throw new Error('Test Error');
			});

			const request = new Request('http://localhost/unknown');
			const response = await handler.handleNoMatch(request);

			expect(response.status).toBe(500);
			expect(FileSystemResponseMatcher.renderServerError).toHaveBeenCalled();
			expect(HmrManager.broadcast).toHaveBeenCalledWith({ type: 'error', message: 'Test Error' });
		});
	});
});
