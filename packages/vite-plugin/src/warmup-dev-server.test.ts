import { describe, expect, it, vi } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { warmupDevServer } from './warmup-dev-server.ts';

function createApi() {
	return createEcopagesPluginApi({
		appConfig: {
			rootDir: '/app',
			baseUrl: 'http://localhost:4012',
			runtime: {},
			integrations: [],
			sourceTransforms: new Map(),
			absolutePaths: {
				componentsDir: '/app/src/components',
				distDir: '/app/dist',
				htmlTemplatePath: '/app/src/app.html',
				includesDir: '/app/src/includes',
				pagesDir: '/app/src/pages',
				layoutsDir: '/app/src/layouts',
			},
		} as never,
	});
}

describe('warmupDevServer', () => {
	it('loads and caches the app module, preloads images, and runs an SSR smoke fetch', async () => {
		const api = createApi();
		api.setDevServerOrigin('http://localhost:4012');
		const fetch = vi.fn(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
		const loadedModules: string[] = [];

		const server = {
			async ssrLoadModule(id: string) {
				loadedModules.push(id);

				if (id === '@ecopages/core/dev/host-runtime') {
					return {
						createDevelopmentHostRuntime() {
							return {
								registerHostModuleLoader() {},
							};
						},
					};
				}

				if (id === 'virtual:ecopages/images.ts') {
					return { images: {} };
				}

				return {
					app: { fetch },
				};
			},
		};

		await warmupDevServer(server as never, api, '/app/app');

		expect(api.getCachedApp()).not.toBeNull();
		expect(loadedModules).toContain('/app/app');
		expect(loadedModules).toContain('virtual:ecopages/images.ts');
		expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://localhost:4012/' }));
	});
});
