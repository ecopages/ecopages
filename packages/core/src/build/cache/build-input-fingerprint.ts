import { statSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { rapidhash } from '../../utils/hash.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { getAppBuildInputIndex } from './build-input-dependency-index.ts';

/**
 * Hashes the config module and the project files it imports (`absolutePaths.configModuleFiles`).
 *
 * @remarks
 * Falls back to the config module alone for hand-built configs that omit `configModuleFiles`.
 *
 * @returns `missing` when the config file does not exist.
 */
export function hashAppConfigFile(appConfig: EcoPagesAppConfig): string {
	const configPath = appConfig.absolutePaths?.config;
	if (!configPath || !fileSystem.exists(configPath)) {
		return 'missing';
	}

	const configModuleFiles = appConfig.absolutePaths.configModuleFiles ?? [configPath];
	return rapidhash(
		[...configModuleFiles]
			.sort()
			.map((filePath) => `${filePath}:${fileSystem.exists(filePath) ? fileSystem.hash(filePath) : 'missing'}`)
			.join('\n'),
	).toString(36);
}

/**
 * Fingerprints processor and integration build-input state for cache invalidation.
 *
 * @remarks
 * No Processor or Integration contributes to it, so it is the same value for every config.
 */
export function createBuildInputsFingerprint(_appConfig: EcoPagesAppConfig): string {
	return 'stable';
}

/**
 * Hashes recorded build inputs (files loaded through build plugins, module closures,
 * and Processor watch directories seeded into the reverse index).
 *
 * @remarks
 * Each path contributes its size and modification time rather than a content
 * hash, as `make` does. Directories use only mtime, so adding or editing a
 * file under a Processor watch root changes the hash without walking the tree.
 */
export function hashRecordedBuildInputs(appConfig: EcoPagesAppConfig): string {
	const entries = getAppBuildInputIndex(appConfig)
		.recordedWatchPaths()
		.sort()
		.flatMap((filePath) => {
			try {
				const stats = statSync(filePath);
				const relative = path.relative(appConfig.rootDir, filePath) || filePath;
				return [`${relative}:${stats.isDirectory() ? 'dir' : stats.size}:${stats.mtimeMs}`];
			} catch {
				return [];
			}
		});
	return entries.length > 0 ? rapidhash(entries.join('\n')).toString(36) : 'none';
}
