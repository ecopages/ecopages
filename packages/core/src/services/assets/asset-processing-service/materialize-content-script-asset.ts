import type { ContentScriptAsset, ProcessedAsset } from './assets.types.ts';
import { resolveInlineContentScriptBody } from './inline-content-script-body.ts';

/**
 * @remarks
 * {@link AssetProcessingService} cache and dev disk cache entries usually keep
 * only an output path. Dependency declarations still carry the metadata HTML and
 * page-browser graph assembly need (`groupedBundle`, attributes, roles), so cache
 * hits must be rehydrated from both sources rather than returned verbatim.
 */
export function materializeContentScriptAsset(dep: ContentScriptAsset, filepath: string): ProcessedAsset {
	return {
		filepath,
		kind: 'script',
		inline: dep.inline ?? false,
		content: resolveInlineContentScriptBody(dep, filepath),
		position: dep.position,
		attributes: dep.attributes,
		excludeFromHtml: dep.excludeFromHtml,
		packageRole: dep.packageRole,
		groupedBundle: dep.groupedBundle,
		bundledSourceFilepaths: dep.bundledSourceFilepaths,
	};
}
