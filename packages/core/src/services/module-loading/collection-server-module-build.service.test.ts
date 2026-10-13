import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import type { BuildExecutor } from '../../build/build-adapter.ts';
import type { BuildOptions } from '../../build/contracts/build-contracts.ts';
import { RolldownBuildAdapter } from '../../build/rolldown/rolldown-build-adapter.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { getAppModuleLoader } from './app-server-module-transpiler.service.ts';
import { buildCollectionServerModule } from './collection-server-module-build.service.ts';

describe('buildCollectionServerModule', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-collection-build-'));
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
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
