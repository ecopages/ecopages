import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import type { BuildAdapter, BuildExecutor, BuildOptions, BuildResult } from '@ecopages/core/build';
import { BuildQueue } from '@ecopages/core/build';
import { createRequestPipelineMetricsState } from '@ecopages/core/build';
import type { ProcessorContext } from '@ecopages/core/processor';
import {
	buildCollectionServerModule,
	type CollectionServerBuildArtifact,
} from './collection-server-module-build.service.ts';

function successfulBuild(outputPath: string, sourceFilePath: string): BuildResult {
	return {
		success: true,
		outputs: [{ path: outputPath }],
		warnings: [],
		loadedInputs: [],
		loadedInputsByModule: {},
		dependencyGraph: { entrypoints: {} },
		entryOutputs: { [sourceFilePath]: outputPath },
		outputGraph: {},
	};
}

function attachCollectionTestRuntime(
	appConfig: ProcessorContext['config'],
	buildQueue: BuildExecutor,
): ProcessorContext['config'] {
	appConfig.appRuntime = {
		buildManifest: { server: [], browser: [] },
		buildQueue: buildQueue as BuildQueue,
		moduleLoader: { getDevelopmentGeneration: () => generation },
		requestPipelineMetrics: createRequestPipelineMetricsState(),
	} as unknown as NonNullable<ProcessorContext['config']['appRuntime']>;
	return appConfig;
}

let generation = 0;

describe('content processor collection server module builds', () => {
	let rootDir: string;
	let artifacts: Map<string, CollectionServerBuildArtifact>;

	beforeEach(() => {
		rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-collection-build-'));
		artifacts = new Map();
		generation = 0;
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	function createAppConfig(buildQueue: BuildExecutor): ProcessorContext['config'] {
		return attachCollectionTestRuntime(
			{
				rootDir,
				absolutePaths: { workDir: path.join(rootDir, '.eco') },
				loaders: new Map(),
				processors: new Map(),
				integrations: [],
			} as unknown as ProcessorContext['config'],
			buildQueue,
		);
	}

	it('builds on the nested lane, so a build waiting for it cannot lock up the build lane', async () => {
		const sourceFilePath = path.join(rootDir, 'posts.collection.ts');
		const parentEntry = path.join(rootDir, 'page.tsx');
		fs.writeFileSync(sourceFilePath, 'export const posts = [];\n', 'utf8');
		const lanes: string[] = [];
		let appConfig: ProcessorContext['config'];
		const adapter: BuildAdapter = {
			async build(options) {
				if (Object.values(options.entrypoints).includes(parentEntry)) {
					await buildCollectionServerModule({
						appConfig,
						artifacts,
						collectionName: 'posts',
						sourceFilePath,
						ownedSourcePaths: [],
					});
					return successfulBuild(path.join(rootDir, 'page.mjs'), parentEntry);
				}
				return successfulBuild(
					path.join(options.outdir!, options.naming!.replace('[ext]', 'mjs')),
					sourceFilePath,
				);
			},
			resolve: (specifier) => specifier,
		};
		const queue = new BuildQueue(adapter, { build: 1, hmr: 1, nested: 1 });
		const queueBuild = queue.build.bind(queue);
		queue.build = (options, lane) => {
			lanes.push(`${lane ?? 'build'}:${String(Object.values(options.entrypoints)[0])}`);
			return queueBuild(options, lane);
		};
		appConfig = createAppConfig(queue);

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
		const routeModuleBuilds: BuildOptions[] = [];
		const appConfig = createAppConfig({
			build(options) {
				routeModuleBuilds.push(options);
				return Promise.resolve(
					successfulBuild(
						path.join(options.outdir!, options.naming!.replace('[ext]', 'mjs')),
						sourceFilePath,
					),
				);
			},
		});
		const artifact = await buildCollectionServerModule({
			appConfig,
			artifacts,
			collectionName: 'posts',
			sourceFilePath,
			ownedSourcePaths: [],
		});

		assert.deepEqual(
			routeModuleBuilds.map((options) => options.entrypoints),
			[[sourceFilePath]],
		);
		assert.equal(
			artifact.outputPath,
			path.join(routeModuleBuilds[0].outdir!, routeModuleBuilds[0].naming!.replace('.[ext]', '.mjs')),
		);
	});

	it('reuses a build until the development generation advances', async () => {
		const sourceFilePath = path.join(rootDir, 'posts.collection.ts');
		fs.writeFileSync(sourceFilePath, 'export const posts = [];\n', 'utf8');
		let buildCount = 0;
		const appConfig = createAppConfig({
			build(options) {
				buildCount += 1;
				return Promise.resolve(
					successfulBuild(
						path.join(options.outdir!, options.naming!.replace('[ext]', 'mjs')),
						sourceFilePath,
					),
				);
			},
		});
		const build = () =>
			buildCollectionServerModule({
				appConfig,
				artifacts,
				collectionName: 'posts',
				sourceFilePath,
				ownedSourcePaths: [],
			});

		const first = await build();
		const second = await build();
		assert.equal(second, first);
		assert.equal(buildCount, 1);

		generation += 1;
		const third = await build();

		assert.equal(buildCount, 2);
		assert.notEqual(third.outputPath, first.outputPath);
	});
});
