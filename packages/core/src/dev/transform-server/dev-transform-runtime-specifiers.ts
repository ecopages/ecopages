import type { DevTransformBundleContributor } from './types.ts';

/**
 * Merges runtime manifest specifiers from all dev-transform contributors.
 */
export function mergeContributorRuntimeSpecifierMaps(
	contributors: readonly DevTransformBundleContributor[],
): Map<string, string> {
	const merged = new Map<string, string>();

	for (const contributor of contributors) {
		const runtimeSpecifierMap = contributor.getRuntimeSpecifierMap?.();
		if (!runtimeSpecifierMap) {
			continue;
		}

		for (const [specifier, url] of runtimeSpecifierMap) {
			merged.set(specifier, url);
		}
	}

	return merged;
}
