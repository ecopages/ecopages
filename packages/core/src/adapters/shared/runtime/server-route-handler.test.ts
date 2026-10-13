import { describe, expect, it, vi } from 'vitest';
import { ServerRouteHandler } from './server-route-handler';
import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { ExplicitStaticRouteMatcher } from '../http/explicit-static-route-matcher.ts';
import type { FileSystemResponseMatcher } from '../http/fs-server-response-matcher.ts';
import type { IHmrManager } from '../../../types/public-types.ts';
import { HttpError } from '../../../errors/http-error.ts';

function createMockDependencies() {
	const Router = {
		matchRequest: vi.fn(() => null),
		origin: 'http://localhost:3000',
	} as unknown as RouteRegistry;

	const FileSystemResponseMatcher = {
		handleMatch: vi.fn(() => Promise.resolve(new Response('Matched Content'))),
		handleNoMatch: vi.fn(() => Promise.resolve(new Response('Not Found', { status: 404 }))),
		renderServerError: vi.fn(() => Promise.resolve(new Response('Internal Server Error', { status: 500 }))),
	} as unknown as FileSystemResponseMatcher;

	const HmrManager = {
		isEnabled: vi.fn(() => true),
		broadcast: vi.fn(),
	} as unknown as IHmrManager;

	return {
		Router,
		FileSystemResponseMatcher,
		HmrManager,
	};
}

describe('ServerRouteHandler', () => {
	describe('handleResponse', () => {
		it('should delegate to fileSystemResponseMatcher when route matches', async () => {
			const { Router, FileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
			});

			Router.matchRequest = vi.fn(() => ({/* match */}) as any);
			await handler.handleResponse(new Request('http://localhost/test'));

			expect(FileSystemResponseMatcher.handleMatch).toHaveBeenCalled();
			expect(FileSystemResponseMatcher.handleNoMatch).not.toHaveBeenCalled();
		});

		it('matches a route whose last segment has a dot, and serves known static extensions from disk', async () => {
			const { Router, FileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
			});
			Router.matchRequest = vi.fn(() => ({}) as any);

			await handler.handleResponse(new Request('http://localhost/v1.2'));
			const assetRequest = new Request('http://localhost/assets/app.js', {
				headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': '"asset-etag"' },
			});
			await handler.handleResponse(assetRequest);

			expect(Router.matchRequest).toHaveBeenCalledExactlyOnceWith('http://localhost/v1.2');
			expect(FileSystemResponseMatcher.handleNoMatch).toHaveBeenCalledWith('/assets/app.js', assetRequest);
		});

		it('should delegate to handleNoMatch when route does not match', async () => {
			const { Router, FileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
			});

			await handler.handleResponse(new Request('http://localhost/unknown'));

			expect(FileSystemResponseMatcher.handleNoMatch).toHaveBeenCalled();
			expect(FileSystemResponseMatcher.handleMatch).not.toHaveBeenCalled();
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

		it('should not inject HMR script (injection lives in SharedServerAdapter)', async () => {
			const { Router, FileSystemResponseMatcher, HmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
				hmrManager: HmrManager,
			});

			Router.matchRequest = vi.fn(() => ({}) as any);
			FileSystemResponseMatcher.handleMatch = vi.fn(() =>
				Promise.resolve(
					new Response('<html><body></body></html>', { headers: { 'Content-Type': 'text/html' } }),
				),
			);

			const request = new Request('http://localhost/test');
			const response = await handler.handleResponse(request);
			const text = await response.text();

			expect(text).toBe('<html><body></body></html>');
			expect(text).not.toContain("import '/_hmr_runtime.js'");
		});
	});

	describe('handleNoMatch', () => {
		it('should broadcast error if handleNoMatch throws', async () => {
			const { Router, FileSystemResponseMatcher, HmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
				hmrManager: HmrManager,
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
