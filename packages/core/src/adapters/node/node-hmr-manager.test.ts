import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test, vi } from 'vitest';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../dev/transform-server/dev-transform-url.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';

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

test('NodeHmrManager shares one in-flight entrypoint registration across concurrent callers', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-register');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-lab.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
		} as any,
	});

	const emitIntegrationEntrypoint = vi.spyOn(manager, 'emitIntegrationEntrypoint');

	const [firstUrl, secondUrl] = await Promise.all([
		manager.registerEntrypoint(entrypointPath),
		manager.registerEntrypoint(entrypointPath),
	]);

	assert.equal(firstUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
	assert.equal(secondUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
	assert.equal(emitIntegrationEntrypoint.mock.calls.length, 0);
});

test('NodeHmrManager does not broadcast HMR events for initial entrypoint registration builds', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-silent-register');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const broadcast = vi.fn();
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 1,
			broadcast,
		} as any,
	});

	const outputUrl = await manager.registerEntrypoint(entrypointPath);

	assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-content.js`);
	assert.equal(broadcast.mock.calls.length, 0);
});

test('NodeHmrManager registers unowned page entrypoints with dev transform URLs', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-strict-fail');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.mdx');
	fs.writeFileSync(entrypointPath, '# Hello', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
		} as any,
	});

	const outputUrl = await manager.registerEntrypoint(entrypointPath);

	assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-content.js`);
	assert.equal(manager.getWatchedFiles().has(path.resolve(entrypointPath)), true);
});

test('NodeHmrManager uses the generic build path for script entrypoints when no strategy emits output', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-script-fallback');
	const srcDir = path.join(rootDir, 'src');
	fs.mkdirSync(srcDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'script.ts');
	fs.writeFileSync(entrypointPath, 'console.log("hello");', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
		} as any,
	});

	const relativePathJs = path
		.relative(config.absolutePaths.srcDir, entrypointPath)
		.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const outputPath = path.join(resolveInternalWorkDir(config), 'assets', '_hmr', relativePathJs);

	installBuildRuntime(config);
	const buildCalls: string[] = [];
	config.runtime!.buildRuntime!.getProfile('browser-hmr').build = vi.fn(async (options) => {
		buildCalls.push(options.entrypoints[0] as string);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, 'fresh-output', 'utf8');

		return {
			success: true,
			logs: [],
			outputs: [{ path: outputPath }],
		};
	});

	vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {});

	const resolved = await manager.registerScriptEntrypoint(entrypointPath);

	assert.equal(resolved.outputUrl, '/assets/_hmr/script.js');
	assert.equal(resolved.outputPath, outputPath);
	assert.deepEqual(buildCalls, [entrypointPath]);
	assert.equal(fs.readFileSync(outputPath, 'utf8'), 'fresh-output');
});

test('NodeHmrManager disables HMR instead of throwing when runtime bundle generation crashes', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-runtime-failure');
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
		} as any,
	});
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	let runtimeEntrypoint: string | undefined;

	vi.spyOn(
		(
			manager as unknown as {
				browserBundleService: { bundle: (options: { entrypoints: string[] }) => Promise<unknown> };
			}
		).browserBundleService,
		'bundle',
	).mockImplementationOnce(async (options: { entrypoints: string[] }) => {
		runtimeEntrypoint = options.entrypoints[0];
		throw new Error('Unexpected end of JSON input');
	});

	await assert.doesNotReject(() => manager.buildRuntime());
	assert.equal(manager.isEnabled(), false);
	assert.equal(runtimeEntrypoint, fileURLToPath(import.meta.resolve('@ecopages/core/hmr/client/hmr-runtime')));
	assert.equal(runtimeEntrypoint?.includes(`${path.sep}.eco${path.sep}hmr${path.sep}client${path.sep}`), false);

	errorSpy.mockRestore();
});

test('NodeHmrManager broadcasts reload when a watched page source changes', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-missing-file');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'deleted-page.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const broadcast = vi.fn();
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 1,
			broadcast,
		} as any,
	});

	await manager.registerEntrypoint(entrypointPath);
	await manager.handleFileChange(entrypointPath);

	assert.equal(broadcast.mock.calls.length, 1);
	assert.equal(broadcast.mock.calls[0]?.[0]?.type, 'reload');
});

test('NodeHmrManager stop clears retained registration state', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-stop-cleanup');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
		} as any,
	});

	await manager.registerEntrypoint(entrypointPath);

	manager.stop();

	assert.equal(manager.getWatchedFiles().size, 0);
	assert.equal(config.runtime?.entrypointDependencyGraph?.getDependencyEntrypoints(entrypointPath).size, 0);
});

test('NodeHmrManager keeps internal browser and server-module outputs out of distDir', async () => {
	const rootDir = createTempRoot('ecopages-node-hmr-internal-paths');
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	using manager = new NodeHmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
		} as any,
	});

	assert.equal(manager.getDistDir(), path.join(resolveInternalWorkDir(config), 'assets', '_hmr'));

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
