import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { describe, test, vi } from 'vitest';
import { installBuildQueue } from '../../../build/runtime/build-queue.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../../dev/transform-server/dev-transform-url.ts';
import { finalizeEcoPagesConfig } from '../../../config/finalize-config.ts';
import { getAppServerModuleTranspiler } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import { resolveInternalExecutionDir } from '../../../utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { ClientBridgeEvent } from '../../../types/public-types.ts';
import { createTempRoot, startNodeHmrManager, writeSourceFile } from './hmr-manager.test-helpers.ts';
import type { SharedHmrManager } from './shared-hmr-manager.ts';

const PAGE_SOURCE = 'export default function Page() { return null; }';

/**
 * Every runtime's manager runs this suite.
 *
 * @remarks
 * What only one runtime does lives beside its manager, as `node-hmr-manager.test.ts` does for the Node
 * overrides. `create` gets an app config so a test can arrange it first.
 */
const runtimes = [
	{
		name: 'node',
		async create(
			config: EcoPagesAppConfig,
			subscriberCount = 0,
		): Promise<{ manager: SharedHmrManager; broadcasts: ClientBridgeEvent[] }> {
			return startNodeHmrManager(config, subscriberCount);
		},
	},
] as const;

describe.each(runtimes)('shared HMR manager contract: $name', ({ create }) => {
	async function createAt(rootDir: string, subscriberCount = 0) {
		return create(await finalizeEcoPagesConfig({ rootDir }), subscriberCount);
	}

	test('shares one transform URL across concurrent page registrations', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-register');
		const entrypointPath = writeSourceFile(rootDir, 'src/pages/react-lab.tsx', PAGE_SOURCE);
		const { manager } = await createAt(rootDir);

		const [firstUrl, secondUrl] = await Promise.all([
			manager.registerEntrypoint(entrypointPath),
			manager.registerEntrypoint(entrypointPath),
		]);

		assert.equal(firstUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
		assert.equal(secondUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-lab.js`);
	});

	test('registers unowned page entrypoints with dev transform URLs', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-transform-url');
		const entrypointPath = writeSourceFile(rootDir, 'src/pages/react-content.mdx', '# Hello');
		const { manager } = await createAt(rootDir);

		const outputUrl = await manager.registerEntrypoint(entrypointPath);

		assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/react-content.js`);
		assert.equal(manager.getWatchedFiles().has(path.resolve(entrypointPath)), true);
	});

	test('registers a second page after the first page is already watched', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-second-page');
		const firstEntrypoint = writeSourceFile(rootDir, 'src/pages/about.tsx', PAGE_SOURCE);
		const secondEntrypoint = writeSourceFile(rootDir, 'src/pages/index.tsx', PAGE_SOURCE);
		const { manager } = await createAt(rootDir);

		const firstUrl = await manager.registerEntrypoint(firstEntrypoint);
		const secondUrl = await manager.registerEntrypoint(secondEntrypoint);

		assert.equal(firstUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/about.js`);
		assert.equal(secondUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`);
		assert.equal(manager.getWatchedFiles().size, 2);
	});

	test('registering a page returns its URL without dispatching a file change or broadcasting', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-silent-register');
		const entrypointPath = writeSourceFile(rootDir, 'src/pages/index.tsx', PAGE_SOURCE);
		const { manager, broadcasts } = await createAt(rootDir, 1);
		const handleFileChange = vi.spyOn(manager, 'handleFileChange');
		const handleFileChanges = vi.spyOn(manager, 'handleFileChanges');

		const outputUrl = await manager.registerEntrypoint(entrypointPath);

		assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`);
		assert.equal(handleFileChange.mock.calls.length, 0);
		assert.equal(handleFileChanges.mock.calls.length, 0);
		assert.deepEqual(broadcasts, []);
	});

	test('registers explicit script entrypoints with dev transform URLs without blocking builds', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-script-register');
		const entrypointPath = writeSourceFile(rootDir, 'src/script.ts', 'console.log("hello");');
		const { manager } = await createAt(rootDir);
		const buildQueue = installBuildQueue(manager.appConfig);
		const buildCalls: string[] = [];
		buildQueue.build = vi.fn(async (options) => {
			buildCalls.push(options.entrypoints[0] as string);
			return {
				success: true,
				logs: [],
				outputs: [{ path: '/tmp/unused.js' }],
			};
		});

		const resolved = await manager.registerScriptEntrypoint(entrypointPath);

		assert.equal(resolved.outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/script.js`);
		assert.equal(resolved.outputPath, path.resolve(entrypointPath));
		assert.deepEqual(buildCalls, []);
	});

	test('registering one script entrypoint does not rebuild previously watched script entrypoints', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-script-targeted-register');
		const firstEntrypoint = writeSourceFile(rootDir, 'src/first.script.ts', 'console.log("first");');
		const secondEntrypoint = writeSourceFile(rootDir, 'src/second.script.ts', 'console.log("second");');
		const { manager } = await createAt(rootDir);
		const buildQueue = installBuildQueue(manager.appConfig);
		const buildCalls: string[][] = [];
		buildQueue.build = vi.fn(async (options) => {
			buildCalls.push((options.entrypoints as string[]).map(String));
			return {
				success: true,
				logs: [],
				outputs: [],
			};
		});

		await manager.registerScriptEntrypoint(firstEntrypoint);
		await manager.registerScriptEntrypoint(secondEntrypoint);

		assert.deepEqual(buildCalls, []);
		assert.equal(
			manager.getRegisteredEntrypoints().get(firstEntrypoint)?.outputUrl,
			`${DEV_TRANSFORM_URL_PREFIX}/first.script.js`,
		);
		assert.equal(
			manager.getRegisteredEntrypoints().get(secondEntrypoint)?.outputUrl,
			`${DEV_TRANSFORM_URL_PREFIX}/second.script.js`,
		);
	});

	test('stop clears retained registration state', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-stop');
		const entrypointPath = writeSourceFile(rootDir, 'src/pages/react-content.tsx', PAGE_SOURCE);
		const dependencyPath = writeSourceFile(rootDir, 'src/lib/shared.ts', 'export const shared = 1;');
		const { manager } = await createAt(rootDir);
		await manager.registerEntrypoint(entrypointPath);
		const dependencyGraph = manager.getDefaultContext().getEntrypointDependencyGraph();
		dependencyGraph.setEntrypointDependencies(entrypointPath, [dependencyPath]);
		assert.equal(dependencyGraph.getDependencyEntrypoints(dependencyPath).size, 1);

		manager.stop();

		assert.equal(manager.getWatchedFiles().size, 0);
		assert.equal(dependencyGraph.getDependencyEntrypoints(dependencyPath).size, 0);
	});

	test('broadcasts the dev transform URL as an update when a registered page source changes', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-page-update');
		const entrypointPath = writeSourceFile(rootDir, 'src/pages/about.tsx', PAGE_SOURCE);
		const { manager, broadcasts } = await createAt(rootDir, 1);

		await manager.registerEntrypoint(entrypointPath);
		await manager.handleFileChange(entrypointPath);

		assert.equal(broadcasts.length, 1);
		assert.equal(broadcasts[0]?.type, 'update');
		assert.equal(broadcasts[0]?.path, `${DEV_TRANSFORM_URL_PREFIX}/pages/about.js`);
	});

	test('leaves server modules of a registered entrypoint edit to the watcher batch', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-no-second-invalidation');
		const entrypointPath = writeSourceFile(rootDir, 'src/pages/react-content.tsx', PAGE_SOURCE);
		const config = await finalizeEcoPagesConfig({ rootDir });
		const appModuleLoader = {
			importModule: vi.fn(async () => ({})),
			invalidateDevelopmentGraph: vi.fn(),
		};
		config.runtime = { ...config.runtime, appModuleLoader: appModuleLoader as never };
		const { manager } = await create(config, 1);
		manager.setEnabled(true);

		await manager.registerEntrypoint(entrypointPath);
		await manager.handleFileChange(entrypointPath);

		assert.equal(appModuleLoader.invalidateDevelopmentGraph.mock.calls.length, 0);
		assert.equal(appModuleLoader.importModule.mock.calls.length, 0);
	});

	test('keeps internal browser and server-module outputs out of distDir', async () => {
		const rootDir = createTempRoot('ecopages-hmr-contract-internal-paths');
		const config = await finalizeEcoPagesConfig({ rootDir });
		const importModule = vi
			.spyOn(getAppServerModuleTranspiler(config), 'importModule')
			.mockImplementation(async () => ({}) as never);
		const { manager } = await create(config);

		await manager
			.getDefaultContext()
			.importServerModule(path.join(config.absolutePaths.srcDir, 'pages', 'index.tsx'));

		assert.equal(
			importModule.mock.calls[0]?.[0]?.outdir,
			path.join(resolveInternalExecutionDir(config), '.server-modules'),
		);
	});

	describe('when the Dev Toolbar runtime fails', () => {
		test('keeps HMR on and logs when the Dev Toolbar package is not installed', async () => {
			const rootDir = createTempRoot('ecopages-hmr-contract-toolbar-missing');
			const config = await finalizeEcoPagesConfig({
				rootDir,
				devToolbar: { package: '@ecopages/missing-dev-toolbar' },
			});
			installBuildQueue(config);
			const { manager } = await create(config);
			manager.setEnabled(true);
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await assert.doesNotReject(() => manager.ensureRuntimeReady());

			assert.equal(manager.isEnabled(), true);
			assert.match(errorSpy.mock.calls.flat().join(' '), /Could not bundle the Dev Toolbar/);
		});

		test('keeps HMR on and logs when the Dev Toolbar package fails to bundle', async () => {
			const rootDir = createTempRoot('ecopages-hmr-contract-toolbar-bundle-failure');
			const packageDir = path.join(rootDir, 'node_modules', 'broken-dev-toolbar');
			fs.mkdirSync(path.join(packageDir, 'src'), { recursive: true });
			fs.writeFileSync(
				path.join(packageDir, 'package.json'),
				'{"name":"broken-dev-toolbar","type":"module","exports":"./src/bootstrap.js"}',
				'utf8',
			);
			fs.writeFileSync(path.join(packageDir, 'src', 'bootstrap.js'), "import './does-not-exist.js';", 'utf8');
			const config = await finalizeEcoPagesConfig({ rootDir, devToolbar: { package: 'broken-dev-toolbar' } });
			installBuildQueue(config);
			const { manager } = await create(config);
			manager.setEnabled(true);
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await assert.doesNotReject(() => manager.ensureRuntimeReady());

			assert.equal(manager.isEnabled(), true);
			assert.match(errorSpy.mock.calls.flat().join(' '), /Could not bundle the Dev Toolbar/);
			assert.match(inspect(errorSpy.mock.calls.flat(), { depth: 5 }), /does-not-exist/);
		});
	});
});
