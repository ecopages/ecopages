import {
	APP_BROWSER_CLIENT_BUNDLE_ID,
	type AssetDefinition,
	type ContentScriptAsset,
} from '@ecopages/core/integration';
import { contentHash } from '@ecopages/core/build';

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

	if (dep.packageRole === 'keep-separate' || dep.packageRole === 'dynamic-chunk') {
		return false;
	}

	return true;
}

/**
 * Names a script's entry from the script alone, so every batch that prepares it gives it the same name and key.
 *
 * @remarks
 * A generated script, which lists `bundledSourceFilepaths`, keeps its own name: its text imports its members by
 * absolute path, so a name hashed from it would change when the app folder moves.
 */
function createPageOwnedGroupedEntryName(dep: ContentScriptAsset): string {
	if (dep.name && dep.bundledSourceFilepaths?.length) return dep.name;
	return dep.name ? `${dep.name}-${contentHash(dep.content, 8)}` : `script-${contentHash(dep.content, 16)}`;
}

/**
 * Tags page-owned content scripts in one dependency batch with the app-wide client bundle id.
 *
 * @remarks
 * Component file scripts and integration runtime assets stay ungrouped. Entries that already assign a grouped id
 * are left unchanged. Returns tagged copies and leaves the given dependencies untouched, so preparing a batch
 * again, or a different batch with the same script, yields the same dependency key.
 */
export function assignPageOwnedContentScriptGroupedBundles(dependencies: AssetDefinition[]): AssetDefinition[] {
	return dependencies.map((dependency) =>
		isPageOwnedGroupableContentScript(dependency)
			? {
					...dependency,
					bundle: true,
					groupedBundle: {
						id: APP_BROWSER_CLIENT_BUNDLE_ID,
						entryName: createPageOwnedGroupedEntryName(dependency),
					},
				}
			: dependency,
	);
}
