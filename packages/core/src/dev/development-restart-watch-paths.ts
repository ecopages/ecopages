import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { DEFAULT_ECOPAGES_WORK_DIR } from '../config/constants.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getDevEnvFileNames } from './development-restart.ts';

export const DEVELOPMENT_RESTART_WATCH_SET_FILENAME = 'development-restart-watch-set.json';

export interface RuntimeRestartWatchSet {
	version: 1;
	cwd: string;
	files: string[];
	roots: string[];
	ignoredDirectories: string[];
}

/** Returns whether `filePath` is a supported project-level dotenv file. */
export function isDevEnvFilePath(filePath: string, rootDir?: string, nodeEnv = process.env.NODE_ENV): boolean {
	if (!rootDir) {
		return false;
	}

	const resolvedPath = path.resolve(filePath);
	if (path.dirname(resolvedPath) !== path.resolve(rootDir)) {
		return false;
	}

	return getDevEnvFileNames(nodeEnv).includes(path.basename(resolvedPath));
}

/**
 * Absolute paths to project-level dotenv files under `rootDir`.
 *
 * @remarks
 * The paths need not exist yet. Watching every supported name allows creating
 * or removing a dotenv file to restart the development process too.
 */
export function resolveDevEnvFilePaths(rootDir?: string, nodeEnv = process.env.NODE_ENV): string[] {
	if (!rootDir) {
		return [];
	}

	return getDevEnvFileNames(nodeEnv).map((envFile) => path.resolve(rootDir, envFile));
}

/** Absolute paths that should restart the development server when changed. */
export function resolveRuntimeRestartWatchPaths(appConfig: EcoPagesAppConfig): string[] {
	const paths = new Set<string>();
	const configModuleFiles = appConfig.absolutePaths?.configModuleFiles;

	if (configModuleFiles?.length) {
		for (const file of configModuleFiles) {
			paths.add(path.resolve(file));
		}
	} else if (appConfig.absolutePaths?.config) {
		paths.add(path.resolve(appConfig.absolutePaths.config));
	}

	for (const envPath of resolveDevEnvFilePaths(appConfig.rootDir)) {
		paths.add(envPath);
	}

	return [...paths];
}

/**
 * Persists the paths the CLI needs if a restarted child fails before its watcher starts.
 *
 * @remarks
 * The runtime copy belongs to the configured work directory. A second copy beside the config gives
 * the CLI a stable lookup path when the configured work directory itself is unavailable to it.
 */
export function writeRuntimeRestartWatchSet(
	appConfig: EcoPagesAppConfig,
	workspacePackageRoots: readonly string[],
): RuntimeRestartWatchSet {
	const configPath = appConfig.absolutePaths?.config ?? path.join(appConfig.rootDir, 'eco.config.ts');
	const supervisorWorkDir = path.join(path.dirname(configPath), DEFAULT_ECOPAGES_WORK_DIR);
	const watchSet: RuntimeRestartWatchSet = {
		version: 1,
		cwd: path.resolve(process.cwd()),
		files: resolveRuntimeRestartWatchPaths(appConfig),
		roots: [...new Set(workspacePackageRoots.map((root) => path.resolve(root)))],
		ignoredDirectories: [
			...new Set(
				[appConfig.absolutePaths?.workDir, appConfig.absolutePaths?.distDir, supervisorWorkDir]
					.filter((directory): directory is string => typeof directory === 'string')
					.map((directory) => path.resolve(directory)),
			),
		],
	};
	const contents = `${JSON.stringify(watchSet)}\n`;
	const runtimePath = path.join(appConfig.absolutePaths.workDir, DEVELOPMENT_RESTART_WATCH_SET_FILENAME);
	const supervisorPath = path.join(supervisorWorkDir, DEVELOPMENT_RESTART_WATCH_SET_FILENAME);

	fileSystem.write(runtimePath, contents);
	if (path.resolve(runtimePath) !== path.resolve(supervisorPath)) {
		fileSystem.write(supervisorPath, contents);
	}

	return watchSet;
}
