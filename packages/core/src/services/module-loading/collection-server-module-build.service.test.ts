import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import type { BuildAdapter, BuildExecutor } from '../../build/build-adapter.ts';
import { BuildQueue } from '../../build/runtime/build-queue.ts';
import type { BuildOptions } from '../../build/contracts/build-contracts.ts';
import { RolldownBuildAdapter } from '../../build/rolldown/rolldown-build-adapter.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { getAppModuleLoader } from './app-server-module-transpiler.service.ts';
import { buildCollectionServerModule } from './collection-server-module-build.service.ts';
import { createBuildSuccess } from '../../__fixtures__/build/build-result.ts';

describe('buildCollectionServerModule', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-collection-build-'));
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	it('builds on the nested lane, so a build waiting for it cannot lock up the build lane', async () => {
		const sourceFilePath = path.join(rootDir, 'posts.collection.ts');
		const parentEntry = path.join(rootDir, 'page.tsx');
		const compiled = path.join(rootDir, 'posts-compiled.mjs');
		fs.writeFileSync(sourceFilePath, 'export const posts = [];\n', 'utf8');
		const lanes: string[] = [];
		const adapter: BuildAdapter = {
			async build(options) {
				if (Object.values(options.entrypoints).includes(parentEntry)) {
					await buildCollectionServerModule({
						appConfig,
						collectionName: 'posts',
						sourceFilePath,
						ownedSourcePaths: [],
					});
				}
				return createBuildSuccess({
					outputs: [{ path: compiled }],
					entryOutputs: { [sourceFilePath]: compiled },
				});
			},
			resolve: (specifier) => specifier,
		};
		const queue = new BuildQueue(adapter, { build: 1, hmr: 1, nested: 1 });
		const queueBuild = queue.build.bind(queue);
		queue.build = (options, lane) => {
			lanes.push(`${lane ?? 'build'}:${String(Object.values(options.entrypoints)[0])}`);
			return queueBuild(options, lane);
		};
		const appConfig = {
			rootDir,
			absolutePaths: { workDir: path.join(rootDir, '.eco') },
			integrations: [],
			runtime: { buildQueue: queue },
		} as unknown as EcoPagesAppConfig;

		const result = await Promise.race([
			queue.build({ environment: 'server', entrypoints: [parentEntry] }),
			new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('timed out')), 2000)),
		]);

		assert.equal(result.success, true);
		assert.deepEqual(lanes, [`build:${parentEntry}`, `nested:${sourceFilePath}`]);
	});

	it('builds through the app route-module executor', async () => {
		const sourceFilePath = path.join(rootDir, 'posts.collection.ts');
		fs.writeFileSync(sourceFilePath, 'export const posts = [];\n', 'utf8');

		const adapter = new RolldownBuildAdapter();
		const routeModuleBuilds: BuildOptions[] = [];
		const routeModuleExecutor: BuildExecutor = {
			build(options) {
				routeModuleBuilds.push(options);
				return adapter.build(options);
			},
		};
		const appConfig = {
			rootDir,
			absolutePaths: { workDir: path.join(rootDir, '.eco') },
			integrations: [],
			runtime: {
				buildQueue: routeModuleExecutor,
			},
		} as unknown as EcoPagesAppConfig;

		const artifact = await buildCollectionServerModule({
			appConfig,
			collectionName: 'posts',
			sourceFilePath,
			ownedSourcePaths: [],
		});

		assert.deepEqual(
			routeModuleBuilds.map((options) => options.entrypoints),
			[[sourceFilePath]],
		);
		assert.ok(fs.existsSync(artifact.outputPath));
	});

	it('reuses a build until the development generation advances', async () => {
		const sourceFilePath = path.join(rootDir, 'posts.collection.ts');
		fs.writeFileSync(sourceFilePath, 'export const posts = [];\n', 'utf8');

		const adapter = new RolldownBuildAdapter();
		let buildCount = 0;
		const appConfig = {
			rootDir,
			absolutePaths: { workDir: path.join(rootDir, '.eco') },
			integrations: [],
			runtime: {
				buildQueue: {
					build(options: BuildOptions) {
						buildCount += 1;
						return adapter.build(options);
					},
				},
			},
		} as unknown as EcoPagesAppConfig;
		const build = () =>
			buildCollectionServerModule({ appConfig, collectionName: 'posts', sourceFilePath, ownedSourcePaths: [] });

		const first = await build();
		const second = await build();
		assert.equal(second, first);
		assert.equal(buildCount, 1);

		getAppModuleLoader(appConfig).invalidateDevelopmentGraph();
		const third = await build();

		assert.equal(buildCount, 2);
		assert.notEqual(third.outputPath, first.outputPath);
	});
});
