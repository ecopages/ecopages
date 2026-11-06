import path from 'node:path';
import { contentHash } from '../../utils/content-hash.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import type { AssetDefinition } from './assets.types.ts';

function generateHash(content: string): string {
	return BigInt(`0x${contentHash(content, 16)}`).toString(10);
}

function getBundledSourceSignature(dep: AssetDefinition, rootDir: string): string[] {
	const bundledSourceFilepaths = dep.bundledSourceFilepaths;
	return bundledSourceFilepaths?.length
		? [
				`bundled-sources:${generateHash(JSON.stringify(bundledSourceFilepaths.map((filePath) => toRootRelativePath(rootDir, filePath))))}`,
			]
		: [];
}

function sortedEntries(record: Record<string, string> | undefined): [string, string][] | undefined {
	return record
		? Object.entries(record).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		: undefined;
}

function getScriptDependencyBuildSignature(dep: AssetDefinition): string | undefined {
	if (dep.kind !== 'script') {
		return undefined;
	}

	const bundleOptions = dep.bundleOptions;
	const signature = {
		bundle: dep.bundle,
		classic: dep.classic,
		excludeFromHtml: dep.excludeFromHtml,
		groupedBundle: dep.groupedBundle,
		naming: bundleOptions?.naming,
		external: bundleOptions?.external,
		minify: bundleOptions?.minify,
		define: sortedEntries(bundleOptions?.define),
		treeshaking: bundleOptions?.treeshaking,
		splitting: bundleOptions?.splitting,
		excludeAppBuildPlugins: bundleOptions?.excludeAppBuildPlugins?.toSorted(),
		plugins: bundleOptions?.plugins?.map((plugin) => [plugin.name, plugin.cacheKey ?? null]),
	};

	return generateHash(JSON.stringify(signature));
}

/**
 * @remarks
 * A Page script bundle (`packageRole: 'page-script'` with bundled sources) is generated from its members and
 * imports them by absolute path, so it is identified by its members rather than by its text.
 */
function getSourceSignature(dep: AssetDefinition, rootDir: string): string[] {
	if ('filepath' in dep) {
		return [toRootRelativePath(rootDir, dep.filepath)];
	}
	if ('importPath' in dep) {
		return [path.isAbsolute(dep.importPath) ? toRootRelativePath(rootDir, dep.importPath) : dep.importPath];
	}
	const isPageScriptBundle =
		dep.kind === 'script' && dep.packageRole === 'page-script' && dep.bundledSourceFilepaths?.length;
	const parts = isPageScriptBundle ? [] : [`content:${generateHash(dep.content)}`];
	if ('processingOrigin' in dep && dep.processingOrigin) {
		parts.push(`origin:${toRootRelativePath(rootDir, dep.processingOrigin)}`);
	}
	return parts;
}

/**
 * The identity of a dependency: two dependencies with one key are built, cached and served as one.
 *
 * @remarks
 * It keys deduplication, the {@link AssetProcessingService} cache and in-flight sharing, the app-wide browser
 * build and its persisted manifest, and `AppRuntime.prebuiltBrowserScripts`.
 *
 * Script dependencies include a build signature: bundle flags, grouped-bundle metadata and every
 * `bundleOptions` field, with each plugin as its name and `cacheKey`. `NODE_ENV` and plugin objects are left
 * out, so a plugin factory that captures an option which changes its output must set `cacheKey`.
 * `attributes` (hashed) and `inline` join the key so dedupe and cache reuse do not collapse declarations that
 * would emit different tags. `name` only names output files and is left out.
 *
 * File paths, bundled sources and a Page script bundle's members are relative to `rootDir`, so the key survives
 * moving the project. Other content is hashed as written: generated content that embeds an absolute path
 * still keys by location.
 *
 * Runtime minify in {@link ContentScriptProcessor} still follows `NODE_ENV` via
 * `isProduction`, not `bundleOptions.minify`.
 */
export function getAssetDependencyKey(dep: AssetDefinition, rootDir: string): string {
	const parts: string[] = [dep.kind, dep.source, ...getSourceSignature(dep, rootDir)];

	if ('position' in dep && dep.position) {
		parts.push(dep.position);
	}

	if (dep.inline) {
		parts.push('inline');
	}

	parts.push(...getBundledSourceSignature(dep, rootDir));

	if ('packageRole' in dep && dep.packageRole) {
		parts.push(`package:${dep.packageRole}`);
	}

	if ((dep.kind === 'script' || dep.kind === 'stylesheet') && dep.attributes) {
		parts.push(`attrs:${generateHash(JSON.stringify(dep.attributes))}`);
	}

	const scriptBuildSignature = getScriptDependencyBuildSignature(dep);
	if (scriptBuildSignature) {
		parts.push(`build:${scriptBuildSignature}`);
	}

	return parts.join(':');
}

/**
 * The key of a dependency that one Integration declares for the app-wide browser build.
 *
 * @remarks
 * The app-wide build and dependency preparation (the Integration hook and `ensureGroupedContentScriptsBundle`)
 * set `groupedBundle` and `bundle`. This key leaves both out of {@link getAssetDependencyKey}, so a declaration
 * keys the same before and after, including when `ecopages start` restores the build without running it.
 */
export function getIntegrationDependencyKey(
	integrationName: string,
	dependency: AssetDefinition,
	rootDir: string,
): string {
	const declared =
		dependency.kind === 'script' ? { ...dependency, groupedBundle: undefined, bundle: undefined } : dependency;
	return JSON.stringify([integrationName, getAssetDependencyKey(declared, rootDir)]);
}

export function deduplicateAssetDependencies(deps: AssetDefinition[], rootDir: string): AssetDefinition[] {
	const seen = new Map<string, AssetDefinition>();

	for (const dep of deps) {
		const key = getAssetDependencyKey(dep, rootDir);
		if (!seen.has(key)) {
			seen.set(key, dep);
		}
	}

	return Array.from(seen.values());
}
