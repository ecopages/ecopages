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
	for (const match of content.matchAll(/@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/g)) {
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

type PageDependencyPackagingPlan = {
	bundledStylesheet?: AssetDefinition;
	bundledScript?: AssetDefinition;
	bundleableStyleFilepaths: Set<string>;
	bundleableScriptFilepaths: Set<string>;
};

/**
 * Returns whether the current integration should collapse eligible page assets into
 * page-owned bundle entries.
 */
export function shouldBundlePageDependencies(integrationName: string): boolean {
	return integrationName === 'react' || integrationName === 'ecopages-jsx';
}

function createPageDependencyPackagingPlan(
	dependencies: AssetDefinition[],
	integrationName: string,
): PageDependencyPackagingPlan | undefined {
	const shouldBundleDependencies = process.env.NODE_ENV === 'production';

	const bundleableStyles = dependencies
		.filter((dependency) => {
			if (!shouldBundleDependencies) {
				return false;
			}

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
		})
		.filter(isBundleableFileStylesheetAsset);

	const bundleableScripts = dependencies
		.filter((dependency) => {
			if (!shouldBundleDependencies) {
				return false;
			}

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
		})
		.filter(isBundleableFileScriptAsset);

	const bundledStylesheet =
		bundleableStyles.length > 1
			? AssetFactory.createContentStylesheet({
					content: bundleableStyles.map((dependency) => readFileSync(dependency.filepath, 'utf8')).join('\n'),
					position: 'head',
					attributes: { rel: 'stylesheet' },
					packageRole: 'page-style',
					bundledSourceFilepaths: bundleableStyles.map((dependency) => dependency.filepath),
				})
			: undefined;

	const pageScriptImports = [...new Set(bundleableScripts.map((dependency) => dependency.filepath))];
	const shouldBundlePageScript = pageScriptImports.length > 0 && bundleableScripts.length > 1;
	const bundledScript = shouldBundlePageScript
		? AssetFactory.createContentScript({
				name: `${integrationName}-page-${rapidhash(pageScriptImports.join('|')).toString(16)}`,
				content: pageScriptImports.map((filepath) => `import ${JSON.stringify(filepath)};`).join('\n'),
				position: 'head',
				attributes: { type: 'module', defer: '' },
				packageRole: 'page-script',
				bundledSourceFilepaths: pageScriptImports,
			})
		: undefined;

	if (!bundledStylesheet && !bundledScript) {
		return undefined;
	}

	return {
		bundledStylesheet,
		bundledScript,
		bundleableStyleFilepaths: new Set(bundleableStyles.map((dependency) => dependency.filepath)),
		bundleableScriptFilepaths: new Set(pageScriptImports),
	};
}

function applyPageDependencyPackagingPlan(
	dependencies: AssetDefinition[],
	plan: PageDependencyPackagingPlan,
): AssetDefinition[] {
	const unifiedDependencies: AssetDefinition[] = [];
	let insertedStylesheet = false;
	let insertedScript = false;

	for (const dependency of dependencies) {
		if (
			plan.bundledStylesheet &&
			dependency.kind === 'stylesheet' &&
			dependency.source === 'file' &&
			plan.bundleableStyleFilepaths.has(dependency.filepath)
		) {
			if (!insertedStylesheet) {
				unifiedDependencies.push(plan.bundledStylesheet);
				insertedStylesheet = true;
			}
			continue;
		}

		if (
			plan.bundledScript &&
			dependency.kind === 'script' &&
			dependency.source === 'file' &&
			plan.bundleableScriptFilepaths.has(dependency.filepath)
		) {
			if (!insertedScript) {
				unifiedDependencies.push(plan.bundledScript);
				insertedScript = true;
			}
			continue;
		}

		unifiedDependencies.push(dependency);
	}

	if (plan.bundledScript && !insertedScript) {
		unifiedDependencies.push(plan.bundledScript);
	}

	if (plan.bundledStylesheet && !insertedStylesheet) {
		unifiedDependencies.push(plan.bundledStylesheet);
	}

	return unifiedDependencies;
}

/**
 * Rewrites eligible flat dependency declarations into page-owned stylesheet and script bundles.
 *
 * Only assets with the default attribute shape and without explicit packaging roles are
 * collapsed so integration-specific or lazy behavior keeps its existing ownership model.
 */
export function packagePageDependencies(dependencies: AssetDefinition[], integrationName: string): AssetDefinition[] {
	if (!shouldBundlePageDependencies(integrationName)) {
		return dependencies;
	}

	const plan = createPageDependencyPackagingPlan(dependencies, integrationName);
	if (!plan) {
		return dependencies;
	}

	return applyPageDependencyPackagingPlan(dependencies, plan);
}
