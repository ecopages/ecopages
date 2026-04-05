import { describe, expect, it, vi } from 'vitest';
import { ServerRouteHandler } from './server-route-handler';
import type { FSRouter } from '../../router/server/fs-router.ts';
import type { FileSystemResponseMatcher } from './fs-server-response-matcher.ts';
import type { IHmrManager } from '../../types/public-types.ts';

function createMockDependencies() {
	const Router = {
		match: vi.fn(() => null),
	} as unknown as FSRouter;

	const FileSystemResponseMatcher = {
		handleMatch: vi.fn(() => Promise.resolve(new Response('Matched Content'))),
		handleNoMatch: vi.fn(() => Promise.resolve(new Response('Not Found', { status: 404 }))),
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

			Router.match = vi.fn(
				() =>
					({
						/* match */
					}) as any,
			);
			const request = new Request('http://localhost/test');
			const response = await handler.handleResponse(request);

			expect(FileSystemResponseMatcher.handleMatch).toHaveBeenCalled();
			expect(response.status).toBe(200);
		});

		it('should delegate to handleNoMatch when route does not match', async () => {
			const { Router, FileSystemResponseMatcher } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
			});

			const request = new Request('http://localhost/unknown');
			const response = await handler.handleResponse(request);

			expect(FileSystemResponseMatcher.handleNoMatch).toHaveBeenCalled();
			expect(response.status).toBe(404);
		});

		it('should inject HMR script in watch mode for HTML responses', async () => {
			const { Router, FileSystemResponseMatcher, HmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
				watch: true,
				hmrManager: HmrManager,
			});

			Router.match = vi.fn(() => ({}) as any);
			FileSystemResponseMatcher.handleMatch = vi.fn(() =>
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
			const { Router, FileSystemResponseMatcher, HmrManager } = createMockDependencies();
			const handler = new ServerRouteHandler({
				router: Router,
				fileSystemResponseMatcher: FileSystemResponseMatcher,
				watch: true,
				hmrManager: HmrManager,
			});

			FileSystemResponseMatcher.handleNoMatch = vi.fn(() => {
				throw new Error('Test Error');
			});

			const request = new Request('http://localhost/unknown');
			const response = await handler.handleNoMatch(request);

			expect(response.status).toBe(500);
			expect(HmrManager.broadcast).toHaveBeenCalledWith({ type: 'error', message: 'Test Error' });
		});
	});
});
