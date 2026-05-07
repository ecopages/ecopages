import { existsSync, readFileSync } from 'node:fs';
import type {
	AssetDefinition,
	FileScriptAsset,
	FileStylesheetAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
import { rapidhash } from '../../utils/hash.ts';

/**
 * Returns `true` when the asset attributes match the exact shape required for
 * safe page-owned bundling.
 */
function hasOnlyExpectedAttributes(
	attributes: Record<string, string> | undefined,
	expected: Record<string, string>,
): boolean {
	const keys = Object.keys(attributes ?? {});
	const expectedKeys = Object.keys(expected);

	if (keys.length !== expectedKeys.length) {
		return false;
	}

	return expectedKeys.every((key) => attributes?.[key] === expected[key]);
}

function isSafeBundledStylesheetReference(reference: string): boolean {
	return (
		reference.startsWith('/') ||
		reference.startsWith('data:') ||
		reference.startsWith('http://') ||
		reference.startsWith('https://') ||
		reference.startsWith('#')
	);
}

/**
 * Normalizes CSS URL tokens before safety checks so quoted and unquoted forms are treated equally.
 */
function normalizeCssReferenceToken(token: string): string {
	return token.trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Rejects stylesheet content that contains relative references which would stop
 * working once multiple files are collapsed into one page-owned bundle.
 */
function isSafeBundledStylesheetContent(content: string): boolean {
	for (const match of content.matchAll(/@import\s+(?:url\()?['"]?([^'"\)\s]+)['"]?\)?/g)) {
		const reference = normalizeCssReferenceToken(match[1] ?? '');
		if (reference && !isSafeBundledStylesheetReference(reference)) {
			return false;
		}
	}

	for (const match of content.matchAll(/url\(([^)]+)\)/g)) {
		const reference = normalizeCssReferenceToken(match[1] ?? '');
		if (reference && !isSafeBundledStylesheetReference(reference)) {
			return false;
		}
	}

	return true;
}

function isBundleableFileStylesheetAsset(dependency: AssetDefinition): dependency is FileStylesheetAsset {
	return dependency.kind === 'stylesheet' && dependency.source === 'file';
}

function isBundleableFileScriptAsset(dependency: AssetDefinition): dependency is FileScriptAsset {
	return dependency.kind === 'script' && dependency.source === 'file';
}

/**
 * Returns whether the current integration should collapse eligible page assets into
 * page-owned bundle entries.
 */
export function shouldBundlePageDependencies(integrationName: string): boolean {
	return integrationName === 'react' || integrationName === 'ecopages-jsx';
}

/**
 * Rewrites eligible flat dependency declarations into page-owned stylesheet and script bundles.
 *
 * Only assets with the default attribute shape and without explicit packaging roles are
 * collapsed so integration-specific or lazy behavior keeps its existing ownership model.
 */
export function createUnifiedPageDependencies(
	dependencies: AssetDefinition[],
	integrationName: string,
): AssetDefinition[] {
	if (!shouldBundlePageDependencies(integrationName)) {
		return dependencies;
	}

	const bundleableStyles = dependencies.filter((dependency) => {
		if (dependency.kind !== 'stylesheet' || dependency.inline || dependency.position === 'body') {
			return false;
		}

		if (dependency.packageRole || !hasOnlyExpectedAttributes(dependency.attributes, { rel: 'stylesheet' })) {
			return false;
		}

		if (dependency.source === 'content') {
			return isSafeBundledStylesheetContent(dependency.content);
		}

		if (!existsSync(dependency.filepath)) {
			return false;
		}

		return isSafeBundledStylesheetContent(readFileSync(dependency.filepath, 'utf8'));
	}).filter(isBundleableFileStylesheetAsset);

	const bundleableScripts = dependencies.filter((dependency) => {
		return (
			dependency.kind === 'script' &&
			dependency.source === 'file' &&
			!dependency.inline &&
			!dependency.excludeFromHtml &&
			dependency.position !== 'body' &&
			!dependency.packageRole &&
			dependency.bundle !== false &&
			hasOnlyExpectedAttributes(dependency.attributes, { type: 'module', defer: '' }) &&
			existsSync(dependency.filepath)
		);
	}).filter(isBundleableFileScriptAsset);

	const bundledStylesheet =
		bundleableStyles.length > 1
			? AssetFactory.createContentStylesheet({
					content: bundleableStyles.map((dependency) => readFileSync(dependency.filepath, 'utf8')).join('\n'),
					position: 'head',
					attributes: { rel: 'stylesheet' },
					packageRole: 'page-style',
				})
			: undefined;

	const bundleableStyleFilepaths = new Set(bundleableStyles.map((dependency) => dependency.filepath));
	const pageScriptImports = [...new Set(bundleableScripts.map((dependency) => dependency.filepath))];
	const bundleableScriptFilepaths = new Set(pageScriptImports);

	const shouldBundlePageScript = pageScriptImports.length > 0 && bundleableScripts.length > 1;

	const bundledScript =
		shouldBundlePageScript
			? AssetFactory.createContentScript({
					name: `${integrationName}-page-${rapidhash(pageScriptImports.join('|')).toString(16)}`,
					content: pageScriptImports.map((filepath) => `import ${JSON.stringify(filepath)};`).join('\n'),
					position: 'head',
					attributes: { type: 'module', defer: '' },
					packageRole: 'page-script',
				})
			: undefined;

	if (!bundledStylesheet && !bundledScript) {
		return dependencies;
	}

	const unifiedDependencies: AssetDefinition[] = [];
	let insertedStylesheet = false;
	let insertedScript = false;

	for (const dependency of dependencies) {
		if (
			bundledStylesheet &&
			dependency.kind === 'stylesheet' &&
			dependency.source === 'file' &&
			bundleableStyleFilepaths.has(dependency.filepath)
		) {
			if (!insertedStylesheet) {
				unifiedDependencies.push(bundledStylesheet);
				insertedStylesheet = true;
			}
			continue;
		}

		if (
			bundledScript &&
			dependency.kind === 'script' &&
			dependency.source === 'file' &&
			bundleableScriptFilepaths.has(dependency.filepath)
		) {
			if (!insertedScript) {
				unifiedDependencies.push(bundledScript);
				insertedScript = true;
			}
			continue;
		}

		unifiedDependencies.push(dependency);
	}

	if (bundledScript && !insertedScript) {
		unifiedDependencies.push(bundledScript);
	}

	if (bundledStylesheet && !insertedStylesheet) {
		unifiedDependencies.push(bundledStylesheet);
	}

	return unifiedDependencies;
}