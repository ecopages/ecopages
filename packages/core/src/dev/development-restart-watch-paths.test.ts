import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import {
	DEVELOPMENT_RESTART_WATCH_SET_FILENAME,
	resolveRuntimeRestartWatchPaths,
	writeRuntimeRestartWatchSet,
} from './development-restart-watch-paths.ts';

const projectRoots: string[] = [];

afterEach(() => {
	for (const root of projectRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

	test('persists config, dotenv, and workspace restart inputs under workDir and beside the config', async () => {
		const rootDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-restart-watch-set-')));
		projectRoots.push(rootDir);
		const appConfig = await finalizeEcoPagesConfig({ rootDir, workDir: '.runtime' });
		const optionsPath = path.join(rootDir, 'mdx-plugin-options.ts');
		appConfig.absolutePaths.configModuleFiles = [appConfig.absolutePaths.config, optionsPath];
		const workspacePackageRoot = path.resolve(rootDir, '../linked-ui');

		const watchSet = writeRuntimeRestartWatchSet(appConfig, [workspacePackageRoot]);
		const serializedWatchSet = JSON.stringify(watchSet);
		const runtimeWatchSetPath = path.join(appConfig.absolutePaths.workDir, DEVELOPMENT_RESTART_WATCH_SET_FILENAME);
		const supervisorWatchSetPath = path.join(rootDir, '.eco', DEVELOPMENT_RESTART_WATCH_SET_FILENAME);

		expect(JSON.parse(readFileSync(runtimeWatchSetPath, 'utf8'))).toEqual(watchSet);
		expect(JSON.parse(readFileSync(supervisorWatchSetPath, 'utf8'))).toEqual(watchSet);
		expect(serializedWatchSet).toContain(path.resolve(optionsPath));
		expect(serializedWatchSet).toContain(path.resolve(rootDir, '.env'));
		expect(watchSet.roots).toEqual([workspacePackageRoot]);
		expect(watchSet.ignoredDirectories).toEqual(
			expect.arrayContaining([
				appConfig.absolutePaths.workDir,
				appConfig.absolutePaths.distDir,
				path.join(rootDir, '.eco'),
			]),
		);
	});
});
