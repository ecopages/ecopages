import type { PageBrowserGraphContribution } from '../../../types/public-types.ts';

/**
 * Merges multiple Page Browser Graph contributions into one declarative payload.
 */
export function mergePageBrowserGraphContributions(
	...contributions: Array<PageBrowserGraphContribution | undefined>
): PageBrowserGraphContribution | undefined {
	const dependencies = [];
	const assets = [];
	const watchPaths = new Set<string>();

	for (const contribution of contributions) {
		if (!contribution) {
			continue;
		}

		if (contribution.dependencies?.length) {
			dependencies.push(...contribution.dependencies);
		}

		if (contribution.assets?.length) {
			assets.push(...contribution.assets);
		}

		for (const watchPath of contribution.watchPaths ?? []) {
			watchPaths.add(watchPath);
		}
	}

	if (dependencies.length === 0 && assets.length === 0 && watchPaths.size === 0) {
		return undefined;
	}

	return {
		...(dependencies.length > 0 ? { dependencies } : {}),
		...(assets.length > 0 ? { assets } : {}),
		...(watchPaths.size > 0 ? { watchPaths: Array.from(watchPaths) } : {}),
	};
}
