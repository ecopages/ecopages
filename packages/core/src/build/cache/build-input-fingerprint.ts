import { statSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { rapidhash } from '../../utils/hash.ts';
import type { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import type { Processor } from '../../plugins/processor.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { getAppBuildInputIndex } from './build-input-dependency-index.ts';

/**
 * Optional contributor surface for build-time cache invalidation.
 *
 * @remarks
 * Processors and integrations may override {@link didChange} to report that
 * their build inputs changed independently of route source files.
 */
export interface BuildInputChangeContributor {
	/**
	 * Returns `true` when this contributor's build inputs changed since the last
	 * persisted incremental build metadata was written.
	 */
	didChange?(): boolean;
}

/** Returns whether a processor or integration signals changed build inputs. */
export function didBuildInputContributorChange(contributor: BuildInputChangeContributor): boolean {
	return contributor.didChange?.() === true;
}

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

/** Fingerprints processor/integration build-input state for cache invalidation. */
export function createBuildInputsFingerprint(appConfig: EcoPagesAppConfig): string {
	const changedContributors = [
		...Array.from(appConfig.processors?.values() ?? [])
			.filter((processor) => didBuildInputContributorChange(processor))
			.map((processor) => `processor:${processor.getName()}`),
		...(appConfig.integrations ?? [])
			.filter((integration) => didBuildInputContributorChange(integration))
			.map((integration) => `integration:${integration.name}`),
	];

	return changedContributors.length > 0 ? changedContributors.sort().join('|') : 'stable';
}

/**
 * Hashes recorded build inputs (plugin `addDependency` paths, module closures,
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

/** Returns true when any processor or integration reports changed build inputs. */
export function haveBuildInputsChanged(appConfig: EcoPagesAppConfig): boolean {
	return createBuildInputsFingerprint(appConfig) !== 'stable';
}

/** Collects every processor and integration that can invalidate incremental builds. */
export function collectBuildInputContributors(appConfig: EcoPagesAppConfig): BuildInputChangeContributor[] {
	return [...Array.from(appConfig.processors?.values() ?? []), ...(appConfig.integrations ?? [])];
}

export type { Processor, IntegrationPlugin };
