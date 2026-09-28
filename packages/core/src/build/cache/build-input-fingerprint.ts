import { fileSystem } from '@ecopages/file-system';
import type { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import type { Processor } from '../../plugins/processor.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

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

/** Hashes the app's eco.config.ts file when present. */
export function hashAppConfigFile(appConfig: EcoPagesAppConfig): string {
	const configPath = appConfig.absolutePaths?.config;
	if (!configPath || !fileSystem.exists(configPath)) {
		return 'missing';
	}

	return fileSystem.hash(configPath);
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

/** Returns true when any processor or integration reports changed build inputs. */
export function haveBuildInputsChanged(appConfig: EcoPagesAppConfig): boolean {
	return createBuildInputsFingerprint(appConfig) !== 'stable';
}

/** Collects every processor and integration that can invalidate incremental builds. */
export function collectBuildInputContributors(appConfig: EcoPagesAppConfig): BuildInputChangeContributor[] {
	return [...Array.from(appConfig.processors?.values() ?? []), ...(appConfig.integrations ?? [])];
}

export type { Processor, IntegrationPlugin };
