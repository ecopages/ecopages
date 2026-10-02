import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { rapidhash } from '../../utils/hash.ts';
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

/**
 * Lists regular files under `root`, or `root` itself when it is a file.
 *
 * @remarks
 * `node_modules` and symlinked directories are skipped, the latter so a link to
 * an ancestor cannot loop. A broken symlink or an unreadable entry is ignored.
 */
function listFiles(root: string): string[] {
	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(root);
	} catch {
		return [];
	}
	if (stats.isFile()) return [root];
	if (!stats.isDirectory()) return [];

	const files: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules') files.push(...listFiles(entryPath));
		} else if (entry.isFile()) {
			files.push(entryPath);
		} else if (entry.isSymbolicLink()) {
			try {
				if (statSync(entryPath).isFile()) files.push(entryPath);
			} catch {
				continue;
			}
		}
	}
	return files;
}

/**
 * Hashes the files Processors declare as watch paths, such as content collection directories.
 *
 * @remarks
 * Incremental static export reuses a page while its route file and compiled
 * dependencies are unchanged, but a Processor can feed rendering from files
 * that are not part of that graph: content collection entries load through
 * dynamic `import()`. When a file under a Processor's `watch.paths` (filtered by
 * `watch.extensions`) is added, removed, or edited, the next export renders every
 * page again. `additionalWatchPaths` stays a development reload list; route
 * module hashing already covers sources pages import.
 */
export function hashWatchedBuildInputs(appConfig: EcoPagesAppConfig): string {
	const files = new Set<string>();
	for (const processor of appConfig.processors?.values() ?? []) {
		const watchConfig = processor.getWatchConfig?.();
		const extensions = watchConfig?.extensions ?? [];
		for (const root of watchConfig?.paths ?? []) {
			for (const filePath of listFiles(root)) {
				if (extensions.length === 0 || extensions.some((extension) => filePath.endsWith(extension))) {
					files.add(filePath);
				}
			}
		}
	}

	const entries = [...files]
		.sort()
		.map((filePath) => `${path.relative(appConfig.rootDir, filePath)}:${fileSystem.hash(filePath)}`);
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
