import type { AssetDefinition, ContentScriptAsset } from '@ecopages/core/services/asset-processing-service';
import { rapidhash } from '@ecopages/core/utils/hash';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';

/** Shared grouped-build id prefix for page-owned content scripts. */
const PAGE_OWNED_CONTENT_SCRIPT_BUNDLE_PREFIX = 'ecopages';

/** Returns the stable grouped-build id for one integration's page-owned content scripts. */
export function createPageOwnedContentScriptBundleId(integrationName: string): string {
	return `${PAGE_OWNED_CONTENT_SCRIPT_BUNDLE_PREFIX}-${integrationName}-page-content-scripts`;
}

function isPageOwnedGroupableContentScript(dep: AssetDefinition): dep is ContentScriptAsset {
	if (dep.kind !== 'script' || dep.source !== 'content' || dep.inline) {
		return false;
	}

	if (dep.excludeFromHtml) {
		return false;
	}

	if (dep.groupedBundle?.id) {
		return false;
	}

	if (dep.packageRole === 'keep-separate' || dep.packageRole === 'runtime' || dep.packageRole === 'dynamic-chunk') {
		return false;
	}

	return true;
}

function createPageOwnedGroupedEntryName(dep: ContentScriptAsset, usedEntryNames: Set<string>): string {
	const baseName = dep.name ?? `script-${rapidhash(dep.content).toString(16)}`;
	if (!usedEntryNames.has(baseName)) {
		usedEntryNames.add(baseName);
		return baseName;
	}

	let suffix = 2;
	let candidate = `${baseName}-${suffix}`;
	while (usedEntryNames.has(candidate)) {
		suffix += 1;
		candidate = `${baseName}-${suffix}`;
	}

	usedEntryNames.add(candidate);
	return candidate;
}

/**
 * Tags page-owned content scripts in one dependency batch with a shared grouped-build id.
 *
 * @remarks
 * Lazy hydration entries (`excludeFromHtml`), component file scripts, and integration runtime
 * assets stay ungrouped. Integrations that already assign a grouped id (for example React
 * Router pages) are left unchanged.
 */
export function assignPageOwnedContentScriptGroupedBundles(dependencies: AssetDefinition[]): AssetDefinition[] {
	const bundleId = createPageOwnedContentScriptBundleId(ECOPAGES_JSX_PLUGIN_NAME);
	const usedEntryNames = new Set<string>();

	for (const dependency of dependencies) {
		if (!isPageOwnedGroupableContentScript(dependency)) {
			continue;
		}

		dependency.groupedBundle = {
			id: bundleId,
			entryName: createPageOwnedGroupedEntryName(dependency, usedEntryNames),
		};
	}

	return dependencies;
}
