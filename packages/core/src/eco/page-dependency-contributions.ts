import type {
	EcoComponentDependencies,
	FileOwnedDependencyContribution,
	PageDependenciesResult,
} from '../types/public-types.ts';

function hasCollectableDependencyFields(dependencies: EcoComponentDependencies): boolean {
	return Boolean(
		dependencies.stylesheets?.length ||
		dependencies.scripts?.length ||
		dependencies.modules?.length ||
		dependencies.components?.length,
	);
}

/**
 * Expands a page dependency result into file-owned contributions.
 *
 * @remarks
 * Nested `contributions` are expanded so collection can resolve each bag against
 * its own owner. Empty bags are omitted.
 */
export function listFileOwnedDependencyContributions(
	value: PageDependenciesResult | EcoComponentDependencies | undefined,
): FileOwnedDependencyContribution[] {
	if (!value) return [];

	const result = value as PageDependenciesResult;
	const nested = result.contributions ?? [];
	const { contributions: _contributions, ownerFile, ...dependencies } = result;
	const listed: FileOwnedDependencyContribution[] = [];

	if (hasCollectableDependencyFields(dependencies)) {
		listed.push(ownerFile ? { ...dependencies, ownerFile } : dependencies);
	}

	for (const contribution of nested) {
		listed.push(...listFileOwnedDependencyContributions(contribution));
	}

	return listed;
}

/**
 * Merges base page dependencies with additional dependencies (such as those returned by a content entry).
 *
 * @remarks
 * Keeps each file-owned contribution intact, including `modules`. Relative assets
 * are not flattened under a single `ownerFile`, so a Page's `./page.css` cannot
 * resolve against a content entry directory. Object-spread of two bags copies
 * `ownerFile` onto the other side's relative paths; use this helper instead.
 */
export function mergePageDependencies(
	base: EcoComponentDependencies | undefined,
	additional: PageDependenciesResult | EcoComponentDependencies | undefined,
): PageDependenciesResult | undefined {
	if (!base) return additional as PageDependenciesResult | undefined;
	if (!additional) return base as PageDependenciesResult;

	const contributions = [
		...listFileOwnedDependencyContributions(base),
		...listFileOwnedDependencyContributions(additional),
	];
	if (contributions.length === 0) return undefined;
	if (contributions.length === 1) return contributions[0];
	return { contributions };
}
