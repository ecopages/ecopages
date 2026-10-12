import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import type { BuildExecutor } from '../../build/build-adapter.ts';
import type { BuildOptions } from '../../build/contracts/build-contracts.ts';
import { RolldownBuildAdapter } from '../../build/rolldown/rolldown-build-adapter.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
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
				buildRuntime: {
					getProfile: (profile: string) => {
						assert.equal(profile, 'route-module');
						return routeModuleExecutor;
					},
					dispose: async () => {},
				},
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
});
