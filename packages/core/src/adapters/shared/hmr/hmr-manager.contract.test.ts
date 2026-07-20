import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test, vi } from 'vitest';
import { installBuildRuntime } from '../../../build/runtime/build-runtime.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../../dev/transform-server/dev-transform-url.ts';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import { resolveInternalWorkDir } from '../../../utils/resolve-work-dir.ts';
import { NodeHmrManager } from '../../node/node-hmr-manager.ts';
import { HmrManager as BunHmrManager } from '../../bun/hmr-manager.ts';
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
	vi.restoreAllMocks();
});

const runtimes = [
	{
		name: 'node',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return new NodeHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
				} as any,
			});
		},
	},
	{
		name: 'bun',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return new BunHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
					subscribe: () => {},
					unsubscribe: () => {},
				} as any,
			});
		},
	},
] as const;

describe.each(runtimes)('shared HMR manager contract: $name', ({ create }) => {
	test('shares one transform URL across concurrent page registrations', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-register');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'react-lab.tsx');
		fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

		using manager = await create(rootDir);

		const emitIntegrationEntrypoint = vi.spyOn(manager, 'emitIntegrationEntrypoint');

		const [firstUrl, secondUrl] = await Promise.all([
			manager.registerEntrypoint(entrypointPath),
			manager.registerEntrypoint(entrypointPath),
		]);

		assert.equal(firstUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
		assert.equal(secondUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
		assert.equal(emitIntegrationEntrypoint.mock.calls.length, 0);
	});

	test('registers unowned page entrypoints with dev transform URLs', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-transform-url');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'react-content.mdx');
		fs.writeFileSync(entrypointPath, '# Hello', 'utf8');

		using manager = await create(rootDir);

		const outputUrl = await manager.registerEntrypoint(entrypointPath);

		assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-content.js`);
		assert.equal(manager.getWatchedFiles().has(path.resolve(entrypointPath)), true);
	});

	test('uses the generic build path for explicit script entrypoints', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-script-register');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const entrypointPath = path.join(srcDir, 'script.ts');
		fs.writeFileSync(entrypointPath, 'console.log("hello");', 'utf8');

		using manager = await create(rootDir);
		installBuildRuntime(manager.appConfig);
		const outputPath = path.join(resolveInternalWorkDir(manager.appConfig), 'assets', '_hmr', 'script.js');
		const buildCalls: string[] = [];
		manager.appConfig.runtime!.buildRuntime!.getProfile('browser-hmr').build = vi.fn(async (options) => {
			buildCalls.push(options.entrypoints[0] as string);
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, 'fresh-output', 'utf8');
			return {
				success: true,
				logs: [],
				outputs: [{ path: outputPath }],
			};
		});

		const resolved = await manager.registerScriptEntrypoint(entrypointPath);

		assert.equal(resolved.outputUrl, '/assets/_hmr/script.js');
		assert.equal(resolved.outputPath, outputPath);
		assert.deepEqual(buildCalls, [entrypointPath]);
		assert.equal(fs.readFileSync(outputPath, 'utf8'), 'fresh-output');
	});

	test('registering one script entrypoint does not rebuild previously watched script entrypoints', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-script-targeted-register');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const firstEntrypoint = path.join(srcDir, 'first.script.ts');
		const secondEntrypoint = path.join(srcDir, 'second.script.ts');
		fs.writeFileSync(firstEntrypoint, 'console.log("first");', 'utf8');
		fs.writeFileSync(secondEntrypoint, 'console.log("second");', 'utf8');

		using manager = await create(rootDir);
		installBuildRuntime(manager.appConfig);
		const buildCalls: string[][] = [];
		manager.appConfig.runtime!.buildRuntime!.getProfile('browser-hmr').build = vi.fn(async (options) => {
			const entrypoints = (options.entrypoints as string[]).map(String);
			buildCalls.push(entrypoints);
			for (const entrypoint of entrypoints) {
				const relativePathJs = path
					.relative(path.join(rootDir, 'src'), entrypoint)
					.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
				const outputPath = path.join(
					resolveInternalWorkDir(manager.appConfig),
					'assets',
					'_hmr',
					relativePathJs,
				);
				fs.mkdirSync(path.dirname(outputPath), { recursive: true });
				fs.writeFileSync(outputPath, `output:${path.basename(entrypoint)}`, 'utf8');
			}
			return {
				success: true,
				logs: [],
				outputs: entrypoints.map((entrypoint) => ({
					path: path.join(
						resolveInternalWorkDir(manager.appConfig),
						'assets',
						'_hmr',
						path.relative(path.join(rootDir, 'src'), entrypoint).replace(/\.(tsx?|jsx?|mdx?)$/, '.js'),
					),
				})),
			};
		});

		await manager.registerScriptEntrypoint(firstEntrypoint);
		await manager.registerScriptEntrypoint(secondEntrypoint);

		assert.deepEqual(buildCalls, [[firstEntrypoint], [secondEntrypoint]]);
	});

	test('stop clears retained registration state', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-stop');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'react-content.tsx');
		fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

		using manager = await create(rootDir);

		await manager.registerEntrypoint(entrypointPath);

		manager.stop();

		assert.equal(manager.getWatchedFiles().size, 0);
	});
});
