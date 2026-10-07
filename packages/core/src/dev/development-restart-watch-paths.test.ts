import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { resolveRuntimeRestartWatchPaths } from './development-restart-watch-paths.ts';

describe('resolveRuntimeRestartWatchPaths', () => {
	test('includes the config module, files it imports, and dotenv paths', async () => {
		const rootDir = '/test/project';
		const appConfig = await finalizeEcoPagesConfig({ rootDir });
		const optionsPath = path.join(rootDir, 'mdx-plugin-options.ts');
		appConfig.absolutePaths.configModuleFiles = [appConfig.absolutePaths.config, optionsPath];

		const restartPaths = resolveRuntimeRestartWatchPaths(appConfig);

		expect(restartPaths).toEqual(
			expect.arrayContaining([
				path.resolve(appConfig.absolutePaths.config),
				path.resolve(optionsPath),
				path.resolve(rootDir, '.env'),
			]),
		);
	});
});
