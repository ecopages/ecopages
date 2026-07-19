import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test, vi } from 'vitest';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import type { ServerAdapterResult } from '../../abstract/server-adapter.ts';
import type { ApiHandler, IHmrManager } from '../../../types/public-types.ts';
import { SharedServerAdapter } from './server-adapter.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function createHmrAssetManager(hmrDir: string): IHmrManager {
	return {
		registerEntrypoint: vi.fn(),
		registerScriptEntrypoint: vi.fn(),
		registerStrategy: vi.fn(),
		setEnabled: vi.fn(),
		stop: vi.fn(),
		isEnabled: vi.fn(() => true),
		broadcast: vi.fn(),
		getOutputUrl: vi.fn(),
		getWatchedFiles: vi.fn(() => new Map()),
		getDistDir: () => hmrDir,
		getRuntimePath: () => '',
		tryHandleAssetRequest: (request: Request) => {
			const url = new URL(request.url);
			if (url.pathname.startsWith('/assets/_hmr/')) {
				const relativePath = url.pathname.slice('/assets/_hmr/'.length);
				const assetPath = path.join(hmrDir, relativePath);
				if (fs.existsSync(assetPath)) {
					return new Response(fs.readFileSync(assetPath), {
						headers: {
							'Content-Type': 'application/javascript',
							'Cache-Control': 'no-store, must-revalidate',
						},
					});
				}
			}
			return null;
		},
		getDefaultContext: vi.fn(),
		handleFileChange: vi.fn(),
	};
}

class TestSharedServerAdapter extends SharedServerAdapter<any, ServerAdapterResult> {
	public async initialize(): Promise<void> {}
	public getServerOptions(): Record<string, never> {
		return {};
	}
	public async buildStatic(): Promise<string | undefined> {
		return undefined;
	}
	public async createAdapter(): Promise<ServerAdapterResult> {
		return {
			getServerOptions: () => ({}),
			buildStatic: async () => undefined,
			servePreviewOnly: async () => undefined,
			dispose: async () => {},
		};
	}
	public async handleRequest(request: Request): Promise<Response> {
		return await this.handleSharedRequest(request, {
			apiHandlers: [],
			hmrManager: createHmrAssetManager(this.hmrDir),
		});
	}

	public async handleSharedRequestForTest(
		request: Request,
		apiHandlers: ApiHandler[],
		hmrManager?: IHmrManager,
	): Promise<Response> {
		return await this.handleSharedRequest(request, {
			apiHandlers,
			hmrManager,
		});
	}

	public setRouteHandlerForTest(handleResponse: (request: Request) => Promise<Response>): void {
		this.routeHandler = {
			handleResponse,
		} as any;
	}

	public setWatchModeForTest(watch: boolean): void {
		(this as unknown as { options: { watch?: boolean } }).options = { watch };
	}

	constructor(
		private readonly hmrDir: string,
		rootDir: string,
	) {
		super({
			appConfig: { rootDir } as any,
			runtimeOrigin: 'http://localhost:3000',
			serveOptions: {},
			options: {},
		});
	}
}

test('SharedServerAdapter serves /assets/_hmr files from the HMR manager directory', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-hmr-assets');
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const hmrDir = path.join(config.absolutePaths.workDir, 'assets', '_hmr');
	const assetPath = path.join(hmrDir, 'pages', 'react-content.js');
	fs.mkdirSync(path.dirname(assetPath), { recursive: true });
	fs.writeFileSync(assetPath, 'export default 1;', 'utf8');

	const adapter = new TestSharedServerAdapter(hmrDir, rootDir);
	const response = await adapter.handleRequest(new Request('http://localhost/assets/_hmr/pages/react-content.js'));

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('Content-Type'), 'application/javascript');
	assert.equal(await response.text(), 'export default 1;');
	assert.equal(
		fs.existsSync(path.join(config.absolutePaths.distDir, 'assets', '_hmr', 'pages', 'react-content.js')),
		false,
	);
});

test('SharedServerAdapter dispatches matching API handlers before filesystem routes', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-api-dispatch');
	const adapter = new TestSharedServerAdapter('', rootDir);
	adapter.setRouteHandlerForTest(async () => new Response('filesystem'));

	const response = await adapter.handleSharedRequestForTest(
		new Request('http://localhost/api/posts/123', { method: 'GET' }),
		[
			{
				path: '/api/posts/[id]',
				method: 'GET',
				handler: ({ params }) => new Response(`api:${params.id}`),
			},
		],
	);

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'api:123');
});

test('SharedServerAdapter falls back to the route handler when no API handler matches', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-route-fallback');
	const adapter = new TestSharedServerAdapter('', rootDir);
	adapter.setRouteHandlerForTest(async () => new Response('filesystem'));

	const response = await adapter.handleSharedRequestForTest(
		new Request('http://localhost/blog/post-1', { method: 'GET' }),
		[
			{
				path: '/api/posts/[id]',
				method: 'GET',
				handler: () => new Response('api'),
			},
		],
	);

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'filesystem');
});

test('SharedServerAdapter injects HMR script into HTML responses in watch mode', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-hmr-inject');
	const adapter = new TestSharedServerAdapter('', rootDir);
	adapter.setWatchModeForTest(true);
	const hmrManager = createHmrAssetManager('');
	adapter.setRouteHandlerForTest(
		async () =>
			new Response('<html><body></body></html>', {
				headers: { 'Content-Type': 'text/html' },
			}),
	);

	const response = await adapter.handleSharedRequestForTest(new Request('http://localhost/test'), [], hmrManager);
	const text = await response.text();

	assert.ok(text.includes("import '/_hmr_runtime.js'"));
	assert.equal(response.headers.get('Cache-Control'), 'no-store, must-revalidate');
});

test('RouteRegistry page module adapter loads page modules through integration renderers', async () => {
	const rootDir = createTempRoot('ecopages-route-registry-page-module-adapter');
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const adapter = new TestSharedServerAdapter('', rootDir);
	(adapter as unknown as { appConfig: typeof config }).appConfig = config;

	const loadPageModule = vi.fn(async () => ({
		default: {
			staticPaths: async () => ({ paths: [] }),
		},
	}));
	const getPageRenderer = vi.fn(() => ({
		loadPageModule,
		execute: vi.fn(),
	}));
	(adapter as unknown as { routeRendererFactory: { getPageRenderer: typeof getPageRenderer } }).routeRendererFactory =
		{ getPageRenderer };

	const pageModuleAdapter = (
		adapter as unknown as {
			createRouteRegistryPageModuleAdapter: () => { loadPageModule: (filePath: string) => Promise<unknown> };
		}
	).createRouteRegistryPageModuleAdapter();
	const result = await pageModuleAdapter.loadPageModule('/pages/blog/[slug].tsx');

	assert.deepEqual(getPageRenderer.mock.calls, [['/pages/blog/[slug].tsx']]);
	assert.deepEqual(loadPageModule.mock.calls, [['/pages/blog/[slug].tsx']]);
	assert.equal(typeof (result as { staticPaths?: unknown }).staticPaths, 'function');
});
