import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { DEV_TRANSFORM_URL_PREFIX } from './dev-transform-url.ts';
import { DevTransformServer } from './dev-transform-server.ts';

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

describe('DevTransformServer', () => {
	it('registerModule returns a stable dev-transform URL', async () => {
		const rootDir = createTempRoot('dev-transform-server-register');
		const config = await new ConfigBuilder().setRootDir(rootDir).build();
		const server = new DevTransformServer({ appConfig: config });
		const sourcePath = path.join(config.absolutePaths.srcDir, 'pages', 'index.tsx');

		const firstUrl = server.registerModule(sourcePath);
		const secondUrl = server.registerModule(sourcePath);

		expect(firstUrl).toBe(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`);
		expect(secondUrl).toBe(firstUrl);
		expect(server.getRegisteredSourcePath(firstUrl)).toBe(path.resolve(sourcePath));
	});

	it('reset clears registered modules', async () => {
		const rootDir = createTempRoot('dev-transform-server-reset');
		const config = await new ConfigBuilder().setRootDir(rootDir).build();
		const server = new DevTransformServer({ appConfig: config });
		const sourcePath = path.join(config.absolutePaths.srcDir, 'pages', 'about.tsx');
		const outputUrl = server.registerModule(sourcePath);

		server.reset();

		expect(server.getRegisteredSourcePath(outputUrl)).toBeUndefined();
		expect(server.getWatchedModules().size).toBe(0);
	});

	it('tryHandleRequest returns null for unknown module URLs', async () => {
		const rootDir = createTempRoot('dev-transform-server-unknown');
		const config = await new ConfigBuilder().setRootDir(rootDir).build();
		const server = new DevTransformServer({ appConfig: config });

		const response = await server.tryHandleRequest(
			new Request(`http://localhost${DEV_TRANSFORM_URL_PREFIX}/missing.js`),
		);

		expect(response).toBeNull();
	});

	it('materializes registered modules on request', async () => {
		const rootDir = createTempRoot('dev-transform-server-materialize');
		const srcDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(srcDir, { recursive: true });
		const entrypointPath = path.join(srcDir, 'index.tsx');
		fs.writeFileSync(entrypointPath, 'export const page = true;\n', 'utf8');

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		const server = new DevTransformServer({ appConfig: config });

		const outputUrl = server.registerModule(entrypointPath);
		const response = await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));

		expect(response?.ok).toBe(true);
		expect(await response?.text()).toContain('page');
	});
});
