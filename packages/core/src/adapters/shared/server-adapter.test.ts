import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
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
