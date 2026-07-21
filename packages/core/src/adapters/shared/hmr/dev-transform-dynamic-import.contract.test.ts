import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'vitest';
import { installBuildRuntime } from '../../../build/runtime/build-runtime.ts';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../../dev/transform-server/dev-transform-url.ts';
import { HmrManager as BunHmrManager } from '../../bun/hmr-manager.ts';
import { NodeHmrManager } from '../../node/node-hmr-manager.ts';
import type { SharedHmrManager } from './shared-hmr-manager.ts';

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

async function readDevTransformResponse(
	manager: SharedHmrManager,
	moduleUrl: string,
): Promise<Response | null> {
	return manager.tryHandleDevClientRequest(new Request(`http://localhost${moduleUrl}`));
}

async function assertMaterializedEntryResolvesLazySibling(
	manager: SharedHmrManager,
	entrypointPath: string,
): Promise<void> {
	const outputUrl = await manager.registerEntrypoint(entrypointPath);
	assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/login.js`);

	const entryResponse = await readDevTransformResponse(manager, outputUrl);
	assert.equal(entryResponse?.status, 200);

	const entryCode = await entryResponse!.text();
	const siblingUrl = `${DEV_TRANSFORM_URL_PREFIX}/pages/lazy-devtools.js`;
	assert.match(entryCode, new RegExp(siblingUrl.replaceAll('/', '\\/')));

	const chunkResponse = await readDevTransformResponse(manager, siblingUrl);
	assert.equal(
		chunkResponse?.status,
		200,
		`expected dev-transform sibling ${siblingUrl} to be served, got ${chunkResponse?.status ?? 'no response'}`,
	);
	assert.match(await chunkResponse!.text(), /devtools/);
}

const runtimes = [
	{
		name: 'node',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
			installBuildRuntime(config);
			return new NodeHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
				} as never,
			});
		},
	},
	{
		name: 'bun',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
			installBuildRuntime(config);
			return new BunHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
					subscribe: () => {},
					unsubscribe: () => {},
				} as never,
			});
		},
	},
] as const;

describe.each(runtimes)('dev-transform dynamic import contract: $name', ({ create }) => {
	/**
	 * @remarks
	 * End-to-end regression for client navigation loading a page module that
	 * dynamically imports a sibling source module via rewritten dev-transform URLs.
	 */
	test('materialized page modules rewrite sibling dynamic imports to dev-transform URLs', async () => {
		const rootDir = createTempRoot('dev-transform-dynamic-import-contract');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		fs.writeFileSync(path.join(pagesDir, 'lazy-devtools.ts'), "export const ReactQueryDevtools = 'devtools';\n", 'utf8');
		const entrypointPath = path.join(pagesDir, 'login.tsx');
		fs.writeFileSync(
			entrypointPath,
			[
				"export async function loadDevtools() {",
				"  const module = await import('./lazy-devtools.ts');",
				"  return module.ReactQueryDevtools;",
				"}",
			].join('\n'),
			'utf8',
		);

		using manager = await create(rootDir);
		manager.setEnabled(true);

		await assertMaterializedEntryResolvesLazySibling(manager, entrypointPath);
	});
});
