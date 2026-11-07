import { path } from '@ecopages/file-system/path';
import { contentHash } from '../../utils/content-hash.ts';
import { toPackagePath } from '../../utils/package-path.ts';
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
 * The text of a generated script with each member it imports written relative to `rootDir`.
 *
 * @remarks
 * Both the raw path and its JSON-escaped form are replaced, as a generator writes either into an import
 * specifier, and the escaped form differs on Windows.
 */
function toPortableGeneratedText(content: string, members: readonly string[], rootDir: string): string {
	let text = content;
	for (const member of members) {
		const relative = toRootRelativePath(rootDir, member);
		text = text.replaceAll(JSON.stringify(member).slice(1, -1), relative).replaceAll(member, relative);
	}
	return text;
}

/**
 * @remarks
 * A generated script, a content script that lists `bundledSourceFilepaths`, imports those members by absolute
 * path, so its text is hashed with each member written relative to the app root, beside its `name`, which its
 * generator derives from root-relative paths. Any other change to the text still changes the key. A package
 * stylesheet is identified by its package path (`fromPackage`), not by where the package is installed.
 */
function getSourceSignature(dep: AssetDefinition, rootDir: string): string[] {
	if (dep.kind === 'stylesheet' && dep.source === 'file' && dep.fromPackage) {
		return [`package:${dep.fromPackage}`];
	}
	if ('filepath' in dep) {
		return [toRootRelativePath(rootDir, dep.filepath)];
	}
	if ('importPath' in dep) {
		if (!path.isAbsolute(dep.importPath)) return [dep.importPath];
		const packagePath = toPackagePath(dep.importPath);
		return [packagePath ? `package:${packagePath}` : toRootRelativePath(rootDir, dep.importPath)];
	}
	const members = dep.kind === 'script' ? dep.bundledSourceFilepaths : undefined;
	const parts = members?.length
		? [
				`generated:${('name' in dep && dep.name) || ''}`,
				`content:${generateHash(toPortableGeneratedText(dep.content, members, rootDir))}`,
			]
		: [`content:${generateHash(dep.content)}`];
	if ('processingOrigin' in dep && dep.processingOrigin) {
		parts.push(`origin:${toRootRelativePath(rootDir, dep.processingOrigin)}`);
	}
	return parts;
}

/**
 * The identity of a dependency: two dependencies with one key are built, cached and served as one.
 *
 * @remarks
 * It keys deduplication, the {@link AssetProcessingService} cache and in-flight sharing, and the production
 * asset ledger (`AppRuntime.processedAssets`), where the app-wide browser build records each script it bundles.
 *
 * Script dependencies include a build signature: bundle flags, grouped-bundle metadata and every
 * `bundleOptions` field, with each plugin as its name and `cacheKey`. `NODE_ENV` and plugin objects are left
 * out, so a plugin factory that captures an option which changes its output must set `cacheKey`.
 * `attributes` (hashed) and `inline` join the key so dedupe and cache reuse do not collapse declarations that
 * would emit different tags or files. `name` only names output files and is left out, except for a generated
 * script, which it helps identify.
 *
 * File paths, bundled sources and a generated script's members are relative to `rootDir`, and a package
 * stylesheet, like a node-module script, keys by its package path, so the key survives moving the project or
 * reinstalling its packages in another store layout.
 * Other content is hashed as written. A plugin `cacheKey` must not capture an absolute path for the same reason.
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
 * The key of a dependency declared for the app-wide browser build.
 *
 * @remarks
 * The app-wide build and dependency preparation (the Integration hook and `ensureGroupedContentScriptsBundle`)
 * set `groupedBundle` and `bundle`. This key leaves both out of {@link getAssetDependencyKey}, so a declaration
 * keys the same before and after, including when `ecopages start` restores the build without running it. It
 * names no Integration: the ledger records one output per dependency key, so a script two Integrations declare
 * is one entry of the build.
 */
export function getDeclaredDependencyKey(dependency: AssetDefinition, rootDir: string): string {
	const declared =
		dependency.kind === 'script' ? { ...dependency, groupedBundle: undefined, bundle: undefined } : dependency;
	return getAssetDependencyKey(declared, rootDir);
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
