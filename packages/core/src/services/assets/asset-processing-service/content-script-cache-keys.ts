import { rapidhash } from '../../../utils/hash.ts';
import type { ContentScriptAsset } from './assets.types.ts';

function generateHash(content: string): string {
	return rapidhash(content).toString();
}

function buildProcessorIdentitySegment(contentHash: string, dep: ContentScriptAsset): string {
	const attrsHash = dep.attributes ? generateHash(JSON.stringify(dep.attributes)) : '';
	const position = dep.position ?? '';
	const packageRole = dep.packageRole ?? '';

	return `content-script:${contentHash}:${contentHash}:${position}:${attrsHash}:${packageRole}`;
}

function createBundleConfigHash(
	dep: ContentScriptAsset,
	options: { shouldBundle: boolean; isProduction: boolean },
): string {
	return generateHash(
		JSON.stringify({
			bundle: options.shouldBundle,
			minify: options.shouldBundle && options.isProduction,
			opts: dep.bundleOptions,
		}),
	);
}

/**
 * Test-only snapshot of the removed {@link ContentScriptProcessor} cache key.
 *
 * @remarks
 * Not used at runtime. Retained so divergence tests document why processor and
 * service keys must not be collapsed without a deliberate migration.
 * Not interchangeable with {@link getAssetDependencyKey}: this key embeds script
 * `attributes`, hashes full `bundleOptions` inside `opts`, and derives minify from
 * `shouldBundle && isProduction` rather than `dep.bundleOptions.minify`.
 */
export function getContentScriptProcessorCacheKey(
	dep: ContentScriptAsset,
	options: { shouldBundle: boolean; isProduction: boolean },
): string {
	const contentHash = generateHash(dep.content);
	const configHash = createBundleConfigHash(dep, options);

	return `${buildProcessorIdentitySegment(contentHash, dep)}:${configHash}`;
}
