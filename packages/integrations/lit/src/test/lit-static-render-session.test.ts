import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent } from '@ecopages/core';
import type { AssetDefinition, ProcessedAsset, StaticExportContext } from '@ecopages/core/integration';
import { LitStaticRenderSession } from '../lit-static-render-session.ts';

const workerStart = vi.fn(async () => {});
const workerRenderPage = vi.fn(async () => ({
	html: '<html>Lit worker</html>',
	cacheStrategy: { revalidate: 60 },
	metadata: { title: 'Page', description: 'Page description' },
}));
const workerDispose = vi.fn(async () => {});

const processDependencies = vi.fn(async () => []);

const createWorkerClient = () => ({
	start: workerStart,
	renderPage: workerRenderPage,
	dispose: workerDispose,
});

function createLazyComponent(integration: 'lit' | 'react', id: string, file: string, script: string): EcoComponent {
	return eco.component<object, string>({
		integration,
		identity: { id, file, integration },
		dependencies: { scripts: [{ src: script, ssr: true, lazy: { 'on:interaction': 'click' } }] },
		render: () => '',
	});
}

describe('LitStaticRenderSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('starts the render worker and forwards page data', async () => {
		const session = new LitStaticRenderSession({
			preloadScopes: new Map(),
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			createWorkerClient,
		});

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		expect(workerStart).toHaveBeenCalledTimes(1);

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
			metadata: { title: 'Page', description: 'Page description' },
		});

		await session.dispose();
		expect(workerDispose).toHaveBeenCalledTimes(1);
	});

	it('recreates the worker when init identity changes', async () => {
		workerStart.mockClear();
		workerDispose.mockClear();

		const createClient = vi.fn(() => createWorkerClient());
		const session = new LitStaticRenderSession({
			preloadScopes: new Map(),
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			createWorkerClient: createClient,
		});

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});
		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		expect(createClient).toHaveBeenCalledTimes(1);
		expect(workerStart).toHaveBeenCalledTimes(1);

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:4000',
		});

		expect(workerDispose).toHaveBeenCalledTimes(1);
		expect(createClient).toHaveBeenCalledTimes(2);
		expect(workerStart).toHaveBeenCalledTimes(2);
		expect(createClient).toHaveBeenLastCalledWith({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:4000',
		});

		await session.dispose();
	});

	it('forwards array PageParams and PageQuery to the worker client', async () => {
		workerRenderPage.mockClear();

		const session = new LitStaticRenderSession({
			preloadScopes: new Map(),
			resolveDependencyPath: (_componentDir, sourcePath) => sourcePath,
			processDependencies,
			createWorkerClient,
		});

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
		});

		await session.renderPageInWorker({
			filePath: '/app/src/pages/catch-all.lit.tsx',
			params: { slug: ['docs', 'intro'] },
			query: { tag: ['a', 'b'], preview: '1' },
		});

		expect(workerRenderPage).toHaveBeenCalledWith({
			filePath: '/app/src/pages/catch-all.lit.tsx',
			params: { slug: ['docs', 'intro'] },
			query: { tag: ['a', 'b'], preview: '1' },
		});

		await session.dispose();
	});

	it('registers lazy SSR elements for Lit routes only', async () => {
		const workDir = await mkdtemp(path.join(tmpdir(), 'lit-static-route-preload-'));
		const litTag = `lit-static-route-${randomUUID()}`;
		const reactTag = `react-static-route-${randomUUID()}`;
		const litComponent = createLazyComponent(
			'lit',
			'lit-page',
			'/app/src/pages/lit.lit.tsx',
			'./lit-counter.script.ts',
		);
		const reactComponent = createLazyComponent(
			'react',
			'react-page',
			'/app/src/pages/react.page.react.tsx',
			'./react-counter.script.ts',
		);
		const routeProcessDependencies = vi.fn(async (dependencies: AssetDefinition[]) => {
			const source = dependencies[0];
			if (!source || source.source !== 'file') {
				throw new Error('Expected the Lit preloader to build a file script.');
			}

			const tag = source.filepath.includes('lit-counter') ? litTag : reactTag;
			const entrypoint = path.join(workDir, path.basename(source.filepath).replace(/\.ts$/, '.mjs'));
			await writeFile(entrypoint, `customElements.define('${tag}', class extends HTMLElement {});`);
			return [{ kind: 'script', filepath: entrypoint } satisfies ProcessedAsset];
		});
		const session = new LitStaticRenderSession({
			preloadScopes: new Map(),
			resolveDependencyPath: (componentDir, sourcePath) => path.resolve(componentDir, sourcePath),
			processDependencies: routeProcessDependencies,
		});

		try {
			await session.preloadStaticRoutes({
				appConfig: {
					integrations: [{ name: 'lit', extensions: ['.lit.tsx'] }],
				},
				baseUrl: 'http://127.0.0.1:3000',
				force: false,
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
					getPageRenderer: vi.fn((filePath: string) => ({
						loadPageModule: vi.fn(async () => ({
							default: filePath.endsWith('.lit.tsx') ? litComponent : reactComponent,
						})),
					})),
				},
			} as unknown as StaticExportContext);

			expect(customElements.get(litTag)).toBeDefined();
			expect(customElements.get(reactTag)).toBeUndefined();
		} finally {
			await session.dispose();
			await rm(workDir, { recursive: true, force: true });
		}
	});
	it('restarts once after source invalidation and serializes concurrent renders', async () => {
		let version = 0;
		const dispose = vi.fn(async () => {});
		const renderPage = vi.fn(async () => ({
			html: '<main />',
			metadata: { title: 'Page', description: 'Page description' },
		}));
		const createClient = vi.fn(() => ({ start: async () => {}, dispose, renderPage }));
		const session = new LitStaticRenderSession({
			preloadScopes: new Map(),
			resolveDependencyPath: (_dir, src) => src,
			processDependencies,
			createWorkerClient: createClient,
			getInvalidationVersion: () => version,
		});
		await session.ensureWorker({ configModulePath: '/app/eco.config.ts', runtimeOrigin: 'http://localhost' });
		await session.renderPageInWorker({ filePath: '/app/page.lit.tsx', params: {} });
		version += 1;
		await Promise.all([
			session.renderPageInWorker({ filePath: '/app/page.lit.tsx', params: {} }),
			session.renderPageInWorker({ filePath: '/app/other.lit.tsx', params: {} }),
		]);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(createClient).toHaveBeenCalledTimes(2);
		expect(renderPage).toHaveBeenCalledTimes(3);
		await session.dispose();
	});
});
