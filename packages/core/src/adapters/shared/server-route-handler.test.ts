import { describe, expect, it, mock } from 'bun:test';
import { ServerRouteHandler } from './server-route-handler';
import type { FSRouter } from '../../router/fs-router';
import type { FileSystemResponseMatcher } from './fs-server-response-matcher';
import type { IHmrManager } from '../../public-types';

function createMockDependencies() {
	const mockRouter = {
		match: mock(() => null),
	} as unknown as FSRouter;

	const mockFileSystemResponseMatcher = {
		handleMatch: mock(() => Promise.resolve(new Response('Matched Content'))),
		handleNoMatch: mock(() => Promise.resolve(new Response('Not Found', { status: 404 }))),
	} as unknown as FileSystemResponseMatcher;

	const mockHmrManager = {
		isEnabled: mock(() => true),
		broadcast: mock(),
	} as unknown as IHmrManager;

	return {
		mockRouter,
		mockFileSystemResponseMatcher,
		mockHmrManager,
	};
}

describe('ServerRouteHandler', () => {
	describe('handleResponse', () => {
		it('should delegate to fileSystemResponseMatcher when route matches', async () => {
			const { mockRouter, mockFileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: mockRouter,
				fileSystemResponseMatcher: mockFileSystemResponseMatcher,
			});

			mockRouter.match = mock(
				() =>
					({
						/* mock match */
					}) as any,
			);
			const request = new Request('http://localhost/test');
			const response = await handler.handleResponse(request);

			expect(mockFileSystemResponseMatcher.handleMatch).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('should delegate to handleNoMatch when route does not match', async () => {
			const { mockRouter, mockFileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: mockRouter,
				fileSystemResponseMatcher: mockFileSystemResponseMatcher,
			});

			const request = new Request('http://localhost/unknown');
			const response = await handler.handleResponse(request);

			expect(mockFileSystemResponseMatcher.handleNoMatch).toHaveBeenCalled();
			expect(response.status).toBe(404);
		});

		it('should inject HMR script in watch mode for HTML responses', async () => {
			const { mockRouter, mockFileSystemResponseMatcher, mockHmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: mockRouter,
				fileSystemResponseMatcher: mockFileSystemResponseMatcher,
				watch: true,
				hmrManager: mockHmrManager,
			});

			mockRouter.match = mock(() => ({}) as any);
			mockFileSystemResponseMatcher.handleMatch = mock(() =>
				Promise.resolve(
					new Response('<html><body></body></html>', { headers: { 'Content-Type': 'text/html' } }),
				),
			);

			const request = new Request('http://localhost/test');
			const response = await handler.handleResponse(request);
			const text = await response.text();

			expect(text).toContain("import '/_hmr_runtime.js'");
		});
	});

	describe('handleNoMatch', () => {
		it('should broadcast error if handleNoMatch throws', async () => {
			const { mockRouter, mockFileSystemResponseMatcher, mockHmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: mockRouter,
				fileSystemResponseMatcher: mockFileSystemResponseMatcher,
				watch: true,
				hmrManager: mockHmrManager,
			});

			mockFileSystemResponseMatcher.handleNoMatch = mock(() => {
				throw new Error('Test Error');
			});

			const request = new Request('http://localhost/unknown');
			const response = await handler.handleNoMatch(request);

			expect(response.status).toBe(500);
			expect(mockHmrManager.broadcast).toHaveBeenCalledWith({ type: 'error', message: 'Test Error' });
		});
	});
});
