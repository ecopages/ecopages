import { describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '@ecopages/core';
import type { StaticExportContext } from '@ecopages/core/plugins/integration-plugin';
import { LitStaticRenderSession } from '../lit-static-render-session.ts';

const workerStart = vi.fn(async () => {});
const workerRenderPage = vi.fn(async () => ({
	html: '<html>Lit worker</html>',
	cacheStrategy: { revalidate: 60 },
}));
const workerDispose = vi.fn(async () => {});

const createWorkerClient = () => ({
	start: workerStart,
	renderPage: workerRenderPage,
	dispose: workerDispose,
});

describe('LitStaticRenderSession', () => {
	it('preloads SSR scripts and always starts the render worker', async () => {
		const lazyScriptComponent = {
			config: {
				__eco: { file: '/app/src/components/lit-counter.lit.tsx' },
				dependencies: {
					scripts: [{ lazy: true, ssr: true, src: './lit-counter.script.ts' }],
				},
			},
		} as unknown as EcoComponent;

		const session = new LitStaticRenderSession({
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			preferSourceImports: true,
			createWorkerClient,
		});

		const preloadSpy = vi.spyOn(session, 'preloadSsrLazyScripts').mockResolvedValue(undefined);

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		expect(workerStart).toHaveBeenCalledTimes(1);

		const context = {
			appConfig: {
				absolutePaths: { config: '/app/eco.config.ts' },
				integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }],
			},
			baseUrl: 'http://127.0.0.1:3000',
			force: false,
			preserveExportDirectory: false,
			router: {
				listStaticGenerationRoutes: vi.fn(async () => [
					{
						pathname: '/integration-matrix/lit-entry',
						requestUrl: '/integration-matrix/lit-entry',
						templateRoute: { filePath: '/app/src/pages/integration-matrix/lit-entry.lit.tsx' },
						params: {},
					},
				]),
			},
			routeRendererFactory: {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => ({
						default: lazyScriptComponent,
					})),
				})),
			},
		} as unknown as StaticExportContext;

		await session.preloadStaticRoutes(context);

		expect(preloadSpy).toHaveBeenCalledWith([lazyScriptComponent]);

		const result = await session.renderPageInWorker({
			filePath: '/app/src/pages/integration-matrix/lit-entry.lit.tsx',
			params: {},
			query: { preview: '1' },
		});
		expect(workerRenderPage).toHaveBeenCalledWith({
			filePath: '/app/src/pages/integration-matrix/lit-entry.lit.tsx',
			params: {},
			query: { preview: '1' },
		});
		expect(result).toEqual({
			html: '<html>Lit worker</html>',
			cacheStrategy: { revalidate: 60 },
		});

		await session.dispose();
		expect(workerDispose).toHaveBeenCalledTimes(1);
	});

	it('preloads SSR scripts only for Lit template routes', async () => {
		const litComponent = {
			config: {
				__eco: { file: '/app/src/pages/lit.lit.tsx' },
			},
		} as unknown as EcoComponent;

		const session = new LitStaticRenderSession({
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
		});
		const preloadSpy = vi.spyOn(session, 'preloadSsrLazyScripts').mockResolvedValue(undefined);

		await session.preloadStaticRoutes({
			appConfig: {
				integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }],
			},
			baseUrl: 'http://127.0.0.1:3000',
			force: false,
			preserveExportDirectory: false,
			router: {
				listStaticGenerationRoutes: vi.fn(async () => [
					{
						pathname: '/react',
						requestUrl: '/react',
						templateRoute: { filePath: '/app/src/pages/react.page.react.tsx' },
						params: {},
					},
					{
						pathname: '/lit',
						requestUrl: '/lit',
						templateRoute: { filePath: '/app/src/pages/lit.lit.tsx' },
						params: {},
					},
				]),
			},
			routeRendererFactory: {
				getPageRenderer: vi.fn(() => ({
					loadPageModule: vi.fn(async () => ({
						default: litComponent,
					})),
				})),
			},
		} as unknown as StaticExportContext);

		expect(preloadSpy).toHaveBeenCalledWith([litComponent]);
	});
});
