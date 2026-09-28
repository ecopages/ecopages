import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test, vi } from 'vitest';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../dev/transform-server/dev-transform-url.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';
import { HmrManager } from './hmr-manager.ts';

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

test('HmrManager shares one in-flight entrypoint registration across concurrent callers', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-register');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-lab.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	const [firstUrl, secondUrl] = await Promise.all([
		manager.registerEntrypoint(entrypointPath),
		manager.registerEntrypoint(entrypointPath),
	]);

	assert.equal(firstUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
	assert.equal(secondUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
});

test('HmrManager registers unowned page entrypoints with dev transform URLs', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-strict-fail');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.mdx');
	fs.writeFileSync(entrypointPath, '# Hello', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	const outputUrl = await manager.registerEntrypoint(entrypointPath);

	assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-content.js`);
	assert.equal(manager.getWatchedFiles().has(path.resolve(entrypointPath)), true);
});

test('HmrManager registers script entrypoints with dev transform URLs without blocking builds', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-script-fallback');
	const srcDir = path.join(rootDir, 'src');
	fs.mkdirSync(srcDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'script.ts');
	fs.writeFileSync(entrypointPath, 'console.log("hello");', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	installBuildRuntime(config);
	const buildCalls: string[] = [];
	config.runtime!.buildRuntime!.getProfile('browser-hmr').build = vi.fn(async (options) => {
		buildCalls.push(options.entrypoints[0] as string);
		return {
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/unused.js' }],
		};
	});

	vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {});

	const resolved = await manager.registerScriptEntrypoint(entrypointPath);

	assert.equal(resolved.outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/script.js`);
	assert.equal(resolved.outputPath, path.resolve(entrypointPath));
	assert.deepEqual(buildCalls, []);
});

test('HmrManager stop clears retained registration state', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-stop-cleanup');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	await manager.registerEntrypoint(entrypointPath);

	manager.stop();

	assert.equal(manager.getWatchedFiles().size, 0);
});

test('HmrManager keeps internal browser and server-module outputs out of distDir', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-internal-paths');
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	assert.equal(manager.getRuntimeWorkDir(), path.join(resolveInternalWorkDir(config), 'assets', 'hmr-runtime'));

	const importModule = vi.fn(async (_options: { outdir: string }) => ({}));
	(manager as unknown as { serverModuleTranspiler: { importModule: typeof importModule } }).serverModuleTranspiler = {
		importModule,
	};

	await manager.getDefaultContext().importServerModule(path.join(config.absolutePaths.srcDir, 'pages', 'index.tsx'));

	assert.equal(
		importModule.mock.calls[0]?.[0]?.outdir,
		path.join(resolveInternalExecutionDir(config), '.server-modules'),
	);
});
