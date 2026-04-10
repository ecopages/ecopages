import { describe, expect, it } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';

describe('ecopagesDevServer', () => {
	it('removes stale body-derived headers after HTML rewriting', async () => {
		let middleware: ((req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void>) | undefined;

		const api = createEcopagesPluginApi({
			appConfig: {
				rootDir: '/app',
				runtime: {},
				integrations: [],
				sourceTransforms: new Map(),
				absolutePaths: {
					pagesDir: '/app/src/pages',
					layoutsDir: '/app/src/layouts',
				},
			} as never,
		});

		const plugin = ecopagesDevServer(api);
		(plugin.configureServer as Function)({
			middlewares: {
				use(handler: typeof middleware) {
					middleware = handler;
				},
			},
			async ssrLoadModule(id: string) {
				if (id === '@ecopages/core/host-module-loader') {
					return {
						setHostModuleLoader() {},
					};
				}

				return {
					app: {
						fetch: async () =>
							new Response('<!DOCTYPE html><html><head></head><body></body></html>', {
								headers: {
									'content-length': '54',
									'content-type': 'text/html; charset=utf-8',
									etag: '"before"',
								},
							}),
					},
				};
			},
		} as never)?.();

		const headers = new Map<string, string>();
		const chunks: Uint8Array[] = [];
		let ended = false;
		const response = {
			statusCode: 0,
			statusMessage: '',
			setHeader(name: string, value: string) {
				headers.set(name, value);
			},
			write(chunk: Uint8Array) {
				chunks.push(chunk);
			},
			end() {
				ended = true;
			},
		};

		await middleware?.(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/',
			},
			response,
			(error?: unknown) => {
				if (error) {
					throw error;
				}
			},
		);

		expect(headers.has('content-length')).toBe(false);
		expect(headers.has('etag')).toBe(false);
		expect(headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')).toContain('/@vite/client');
		expect(ended).toBe(true);
	});
});
