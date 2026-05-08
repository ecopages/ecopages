import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import type { ApiHandler } from '../../types/public-types.ts';
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

class TestSharedServerAdapter extends SharedServerAdapter<any, ServerAdapterResult> {
	public async initialize(): Promise<void> {}
	public getServerOptions(): Record<string, never> {
		return {};
	}
	public async buildStatic(): Promise<void> {}
	public async createAdapter(): Promise<ServerAdapterResult> {
		return {
			getServerOptions: () => ({}),
			buildStatic: async () => {},
		};
	}
	public async handleRequest(request: Request): Promise<Response> {
		return await this.handleSharedRequest(request, {
			apiHandlers: [],
			hmrManager: {
				getRuntimePath: () => '',
				getDistDir: () => this.hmrDir,
			},
		});
	}

	public async handleSharedRequestForTest(request: Request, apiHandlers: ApiHandler[]): Promise<Response> {
		return await this.handleSharedRequest(request, {
			apiHandlers,
		});
	}

	public setRouteHandlerForTest(handleResponse: (request: Request) => Promise<Response>): void {
		this.routeHandler = {
			handleResponse,
		} as any;
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
