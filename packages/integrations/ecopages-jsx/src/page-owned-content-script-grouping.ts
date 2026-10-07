import {
	APP_BROWSER_CLIENT_BUNDLE_ID,
	type AssetDefinition,
	type ContentScriptAsset,
} from '@ecopages/core/services/asset-processing-service';
import { rapidhash } from '@ecopages/core/hash';

/** Returns the app-wide grouped-build id used for page-owned content scripts. */
export function createPageOwnedContentScriptBundleId(_integrationName?: string): string {
	return APP_BROWSER_CLIENT_BUNDLE_ID;
}

function isPageOwnedGroupableContentScript(dep: AssetDefinition): dep is ContentScriptAsset {
	if (dep.kind !== 'script' || dep.source !== 'content' || dep.inline) {
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
 * Tags page-owned content scripts in one dependency batch with the app-wide client bundle id.
 *
 * @remarks
 * Component file scripts and integration runtime assets stay ungrouped. Entries that
 * already assign a grouped id are left unchanged.
 */
export function assignPageOwnedContentScriptGroupedBundles(dependencies: AssetDefinition[]): AssetDefinition[] {
	const bundleId = APP_BROWSER_CLIENT_BUNDLE_ID;
	const usedEntryNames = new Set<string>();

	for (const dependency of dependencies) {
		if (!isPageOwnedGroupableContentScript(dependency)) {
			continue;
		}

		dependency.groupedBundle = {
			id: bundleId,
			entryName: createPageOwnedGroupedEntryName(dependency, usedEntryNames),
		};

		if (dependency.bundle === false) {
			dependency.bundle = true;
		}
	}

	return dependencies;
}
