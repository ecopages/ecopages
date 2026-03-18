import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test, vi } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { NodeHmrManager } from '../node/node-hmr-manager.ts';
import { HmrManager as BunHmrManager } from '../bun/hmr-manager.ts';

type SharedHmrManager = {
	handleFileChange(filePath: string, options?: { broadcast?: boolean }): Promise<void>;
	registerEntrypoint(entrypointPath: string): Promise<string>;
	registerScriptEntrypoint(entrypointPath: string): Promise<string>;
	registerSpecifierMap(map: Record<string, string>): void;
	getWatchedFiles(): Map<string, string>;
	getSpecifierMap(): Map<string, string>;
	stop(): void;
	appConfig: Awaited<ReturnType<ConfigBuilder['build']>>;
	readonly runtimeName: string;
};

function withRuntimeName<T extends Omit<SharedHmrManager, 'runtimeName'>>(
	manager: T,
	runtimeName: SharedHmrManager['runtimeName'],
): T & Pick<SharedHmrManager, 'runtimeName'> {
	return Object.assign(manager, { runtimeName });
}

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
			return withRuntimeName(new NodeHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
				} as any,
			}), 'node');
		},
	},
	{
		name: 'bun',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return withRuntimeName(new BunHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
					subscribe: () => {},
					unsubscribe: () => {},
				} as any,
			}), 'bun');
		},
	},
] as const;

function getEntrypointOutputPath(manager: SharedHmrManager, entrypointPath: string): string {
	const relativePathJs = path
		.relative(manager.appConfig.absolutePaths.srcDir, entrypointPath)
		.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
	const encodedPathJs = relativePathJs.replace(/\[([^\]]+)\]/g, '_$1_');
	return path.join(manager.appConfig.absolutePaths.distDir, 'assets', '_hmr', encodedPathJs);
}

describe.each(runtimes)('shared HMR manager contract: $name', ({ create }) => {
	test('shares one in-flight entrypoint registration across concurrent callers', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-register');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'react-lab.tsx');
		fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

		const manager = await create(rootDir);
		const outputPath = getEntrypointOutputPath(manager, entrypointPath);

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

		manager.stop();
	});

	test('fails strict page registration when no integration emits output', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-strict-fail');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'react-content.mdx');
		fs.writeFileSync(entrypointPath, '# Hello', 'utf8');

		const manager = await create(rootDir);
		vi.spyOn(manager, 'handleFileChange').mockImplementation(async () => {});

		await assert.rejects(() => manager.registerEntrypoint(entrypointPath), /Integration failed to emit entrypoint/);
		assert.equal(manager.getWatchedFiles().has(path.resolve(entrypointPath)), false);

		manager.stop();
	});

	test('uses the generic build path for explicit script entrypoints', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-script-register');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const entrypointPath = path.join(srcDir, 'script.ts');
		fs.writeFileSync(entrypointPath, 'console.log("hello");', 'utf8');

		const manager = await create(rootDir);
		const outputPath = path.join(manager.appConfig.absolutePaths.distDir, 'assets', '_hmr', 'script.js');
		const buildCalls: string[] = [];
		manager.appConfig.runtime!.buildExecutor = {
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

	test('stop clears retained registration state', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-stop');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'react-content.tsx');
		fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

		const manager = await create(rootDir);
		const outputPath = getEntrypointOutputPath(manager, entrypointPath);

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
});
