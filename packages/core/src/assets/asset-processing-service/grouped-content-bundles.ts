import type { AssetDefinition } from './assets.types.ts';
import { isDevelopmentRuntime } from '../../utils/runtime.ts';

function isGroupedScriptDependency(dep: AssetDefinition): dep is AssetDefinition & {
	kind: 'script';
	groupedBundle: { id: string; entryName: string };
} {
	return dep.kind === 'script' && Boolean(dep.groupedBundle?.id);
}

/** Forces grouped scripts to run through the bundler in production builds. */
export function ensureGroupedContentScriptsBundle(dependencies: AssetDefinition[]): void {
	if (isDevelopmentRuntime()) {
		return;
	}

	for (const dependency of dependencies) {
		if (!isGroupedScriptDependency(dependency)) {
			continue;
		}

		if (dependency.bundle === false) {
			dependency.bundle = true;
		}
	}
}

/**
 * Splits grouped script dependencies from ordinary dependencies so callers can
 * route them through `processGrouped` without changing ordering for the remaining assets.
 */
export function partitionGroupedContentScriptDependencies(typeDeps: AssetDefinition[]): {
	groupedBundleDeps: Map<string, AssetDefinition[]>;
	ungroupedDeps: AssetDefinition[];
} {
	const groupedBundleDeps = new Map<string, AssetDefinition[]>();
	const ungroupedDeps: AssetDefinition[] = [];

	for (const dep of typeDeps) {
		if (isGroupedScriptDependency(dep)) {
			const existing = groupedBundleDeps.get(dep.groupedBundle.id) ?? [];
			existing.push(dep);
			groupedBundleDeps.set(dep.groupedBundle.id, existing);
			continue;
		}

		ungroupedDeps.push(dep);
	}

	return {
		groupedBundleDeps,
		ungroupedDeps,
	};
}
