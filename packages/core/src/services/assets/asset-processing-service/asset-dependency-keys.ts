import { rapidhash } from '../../../utils/hash.ts';
import type { AssetDefinition } from './assets.types.ts';

function generateHash(content: string): string {
	return rapidhash(content).toString();
}

function getScriptDependencyBuildSignature(dep: AssetDefinition): string | undefined {
	if (dep.kind !== 'script') {
		return undefined;
	}

	const pluginNames = dep.bundleOptions?.plugins?.map((plugin) => plugin.name) ?? [];
	const signature = {
		bundle: dep.bundle,
		inline: dep.inline,
		excludeFromHtml: dep.excludeFromHtml,
		groupedBundle: dep.groupedBundle,
		naming: dep.bundleOptions?.naming,
		external: dep.bundleOptions?.external,
		minify: dep.bundleOptions?.minify,
		plugins: pluginNames,
	};

	return generateHash(JSON.stringify(signature));
}

/**
 * Stable identity for dependency deduplication and {@link AssetProcessingService} cache lookups.
 *
 * @remarks
 * Script dependencies include a build signature derived from bundle flags, grouped-bundle
 * metadata, and selected `bundleOptions` fields (`naming`, `external`, `minify`, plugin names).
 * HTML-affecting script `attributes` are hashed into the key so dedupe and cache reuse do not
 * collapse declarations that would emit different `<script>` tags. Full plugin objects and
 * `NODE_ENV` are excluded from the key.
 *
 * Runtime minify in {@link ContentScriptProcessor} still follows `NODE_ENV` via
 * `isProduction`, not `bundleOptions.minify`.
 */
export function getAssetDependencyKey(dep: AssetDefinition): string {
	const parts: string[] = [dep.kind, dep.source];

	if ('filepath' in dep) {
		parts.push(dep.filepath);
	} else if ('content' in dep) {
		parts.push(`content:${generateHash(dep.content)}`);
	} else if ('importPath' in dep) {
		parts.push(dep.importPath);
	}

	if ('position' in dep && dep.position) {
		parts.push(dep.position);
	}

	if ('packageRole' in dep && dep.packageRole) {
		parts.push(`package:${dep.packageRole}`);
	}

	if (dep.kind === 'script' && dep.attributes) {
		parts.push(`attrs:${generateHash(JSON.stringify(dep.attributes))}`);
	}

	const scriptBuildSignature = getScriptDependencyBuildSignature(dep);
	if (scriptBuildSignature) {
		parts.push(`build:${scriptBuildSignature}`);
	}

	return parts.join(':');
}

export function deduplicateAssetDependencies(deps: AssetDefinition[]): AssetDefinition[] {
	const seen = new Map<string, AssetDefinition>();

	for (const dep of deps) {
		const key = getAssetDependencyKey(dep);
		if (!seen.has(key)) {
			seen.set(key, dep);
		}
	}

	return Array.from(seen.values());
}
