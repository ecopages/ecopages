import type { ContentScriptAsset, ProcessedAsset } from './assets.types.ts';

/**
 * Builds a processed content-script asset from one dependency declaration and a
 * previously emitted output file.
 *
 * @remarks
 * Dev disk cache entries store only output paths. Callers must materialize the
 * full processed asset from the originating dependency so HTML and page-browser
 * graph assembly receive grouped-bundle metadata and script attributes.
 */
export function materializeContentScriptAsset(dep: ContentScriptAsset, filepath: string): ProcessedAsset {
	return {
		filepath,
		kind: 'script',
		inline: dep.inline ?? false,
		content: dep.inline ? dep.content : undefined,
		position: dep.position,
		attributes: dep.attributes,
		excludeFromHtml: dep.excludeFromHtml,
		packageRole: dep.packageRole,
		groupedBundle: dep.groupedBundle,
		bundledSourceFilepaths: dep.bundledSourceFilepaths,
	};
}
