import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test, vi } from 'vitest';
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
	const manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	const relativePathJs = path
		.relative(config.absolutePaths.srcDir, entrypointPath)
		.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const encodedPathJs = relativePathJs.replace(/\[([^\]]+)\]/g, '_$1_');
	const outputPath = path.join(resolveInternalWorkDir(config), 'assets', '_hmr', encodedPathJs);

	const handleFileChange = vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {
		await new Promise((resolve) => setTimeout(resolve, 25));
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, 'export default 1;', 'utf8');
	});

	const [firstUrl, secondUrl] = await Promise.all([
		manager.registerEntrypoint(entrypointPath),
		manager.registerEntrypoint(entrypointPath),
	]);

	assert.equal(firstUrl, '/assets/_hmr/pages/react-lab.js');
	assert.equal(secondUrl, '/assets/_hmr/pages/react-lab.js');
	assert.equal(handleFileChange.mock.calls.length, 1);
	assert.equal(fs.existsSync(outputPath), true);

	manager.stop();
});

test('HmrManager clears timed-out entrypoint registrations so later requests can retry', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-timeout-register');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'stuck-page.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	const previousNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'development';

	const handleFileChange = vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {
		await new Promise(() => undefined);
	});

	try {
		await assert.rejects(() => manager.registerEntrypoint(entrypointPath), /Timed out registering entrypoint/);

		const registrations = (manager as unknown as { entrypointRegistrations: Map<string, Promise<string>> })
			.entrypointRegistrations;
		const watchedFiles = manager.getWatchedFiles();
		assert.equal(registrations.size, 0);
		assert.equal(watchedFiles.has(entrypointPath), false);

		handleFileChange.mockImplementationOnce(async () => {
			const relativePathJs = path
				.relative(config.absolutePaths.srcDir, entrypointPath)
				.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
			const encodedPathJs = relativePathJs.replace(/\[([^\]]+)\]/g, '_$1_');
			const outputPath = path.join(resolveInternalWorkDir(config), 'assets', '_hmr', encodedPathJs);
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, 'export default 2;', 'utf8');
		});

		const retriedUrl = await manager.registerEntrypoint(entrypointPath);
		assert.equal(retriedUrl, '/assets/_hmr/pages/stuck-page.js');
		assert.equal(watchedFiles.get(entrypointPath), retriedUrl);
	} finally {
		process.env.NODE_ENV = previousNodeEnv;
		manager.stop();
	}
});

test('HmrManager fails strict entrypoint registration when the owning integration emits no output', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-strict-fail');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.mdx');
	fs.writeFileSync(entrypointPath, '# Hello', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {});

	await assert.rejects(() => manager.registerEntrypoint(entrypointPath), /Integration failed to emit entrypoint/);
	assert.equal(manager.getWatchedFiles().has(path.resolve(entrypointPath)), false);

	manager.stop();
});

test('HmrManager uses the generic build path for script entrypoints when no strategy emits output', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-script-fallback');
	const srcDir = path.join(rootDir, 'src');
	fs.mkdirSync(srcDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'script.ts');
	fs.writeFileSync(entrypointPath, 'console.log("hello");', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	const outputPath = path.join(resolveInternalWorkDir(config), 'assets', '_hmr', 'script.js');
	const buildCalls: string[] = [];
	config.runtime!.buildExecutor = {
		build: vi.fn(async (options) => {
			buildCalls.push(options.entrypoints[0] as string);
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, 'fresh-output', 'utf8');

			return {
				success: true,
				logs: [],
				outputs: [{ path: outputPath }],
			};
		}),
	};

	vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {});

	const outputUrl = await manager.registerScriptEntrypoint(entrypointPath);

	assert.equal(outputUrl, '/assets/_hmr/script.js');
	assert.deepEqual(buildCalls, [entrypointPath]);
	assert.equal(fs.readFileSync(outputPath, 'utf8'), 'fresh-output');

	manager.stop();
});

test('HmrManager stop clears retained registration state', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-stop-cleanup');
	const srcDir = path.join(rootDir, 'src');
	const pagesDir = path.join(srcDir, 'pages');
	fs.mkdirSync(pagesDir, { recursive: true });

	const entrypointPath = path.join(pagesDir, 'react-content.tsx');
	fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
		} as any,
	});

	const relativePathJs = path
		.relative(config.absolutePaths.srcDir, entrypointPath)
		.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const encodedPathJs = relativePathJs.replace(/\[([^\]]+)\]/g, '_$1_');
	const outputPath = path.join(resolveInternalWorkDir(config), 'assets', '_hmr', encodedPathJs);

	vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, 'export default 1;', 'utf8');
	});

	manager.registerSpecifierMap({ react: '/assets/vendors/react.js' });
	await manager.registerEntrypoint(entrypointPath);

	manager.stop();

	assert.equal(manager.getWatchedFiles().size, 0);
	assert.equal(manager.getSpecifierMap().size, 0);
});

test('HmrManager keeps internal browser and server-module outputs out of distDir', async () => {
	const rootDir = createTempRoot('ecopages-bun-hmr-internal-paths');
	const config = await new ConfigBuilder().setRootDir(rootDir).build();
	const manager = new HmrManager({
		appConfig: config,
		bridge: {
			subscriberCount: 0,
			broadcast: () => {},
			subscribe: () => {},
			unsubscribe: () => {},
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

	manager.stop();
});
