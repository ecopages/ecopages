import path from 'node:path';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getDevEnvFileNames } from './development-restart.ts';

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
	const paths: string[] = [];

	if (appConfig.absolutePaths?.config) {
		paths.push(appConfig.absolutePaths.config);
	}

	for (const envPath of resolveDevEnvFilePaths(appConfig.rootDir)) {
		paths.push(envPath);
	}

	return paths;
}
