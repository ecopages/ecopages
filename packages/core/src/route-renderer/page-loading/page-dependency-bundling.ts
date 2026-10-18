import { existsSync, readFileSync } from 'node:fs';
import type {
	AssetDefinition,
	FileScriptAsset,
	FileStylesheetAsset,
} from '../../assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../assets/asset-processing-service/index.ts';
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
	stylesheetBundles: Map<number, AssetDefinition>;
	bundledStylesheetMembers: Set<number>;
	scriptBundles: Map<number, AssetDefinition>;
	bundledScriptMembers: Set<number>;
};

/**
 * Returns whether the integration has opted into page-owned asset bundles.
 */
export function shouldBundlePageDependencies(bundlesPageDependencies: boolean): boolean {
	return bundlesPageDependencies;
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

	const eligibleStyles = new Set<AssetDefinition>(bundleableStyles);
	const eligibleScripts = new Set<AssetDefinition>(bundleableScripts);
	const isEligibleStyle = (dependency: AssetDefinition): dependency is FileStylesheetAsset =>
		eligibleStyles.has(dependency);
	const isEligibleScript = (dependency: AssetDefinition): dependency is FileScriptAsset =>
		eligibleScripts.has(dependency);
	const stylesheetBundles = new Map<number, AssetDefinition>();
	const bundledStylesheetMembers = new Set<number>();
	const scriptBundles = new Map<number, AssetDefinition>();
	const bundledScriptMembers = new Set<number>();

	for (const run of collectContiguousEligibleRuns(dependencies, isEligibleStyle)) {
		const bundledStylesheet = AssetFactory.createContentStylesheet({
			content: run.assets.map((dependency) => readFileSync(dependency.filepath, 'utf8')).join('\n'),
			position: 'head',
			attributes: { rel: 'stylesheet' },
			packageRole: 'page-style',
			bundledSourceFilepaths: run.assets.map((dependency) => dependency.filepath),
		});
		stylesheetBundles.set(run.startIndex, bundledStylesheet);
		for (let index = run.startIndex; index < run.startIndex + run.assets.length; index += 1) {
			bundledStylesheetMembers.add(index);
		}
	}

	for (const run of collectContiguousEligibleRuns(dependencies, isEligibleScript)) {
		const pageScriptImports = [...new Set(run.assets.map((dependency) => dependency.filepath))];
		const bundledScript = AssetFactory.createContentScript({
			name: `${integrationName}-page-${rapidhash(pageScriptImports.join('|')).toString(16)}`,
			content: pageScriptImports.map((filepath) => `import ${JSON.stringify(filepath)};`).join('\n'),
			position: 'head',
			attributes: { type: 'module', defer: '' },
			packageRole: 'page-script',
			bundledSourceFilepaths: pageScriptImports,
		});
		scriptBundles.set(run.startIndex, bundledScript);
		for (let index = run.startIndex; index < run.startIndex + run.assets.length; index += 1) {
			bundledScriptMembers.add(index);
		}
	}

	if (stylesheetBundles.size === 0 && scriptBundles.size === 0) {
		return undefined;
	}

	return {
		stylesheetBundles,
		bundledStylesheetMembers,
		scriptBundles,
		bundledScriptMembers,
	};
}

function collectContiguousEligibleRuns<T extends AssetDefinition>(
	dependencies: AssetDefinition[],
	isEligible: (dependency: AssetDefinition) => dependency is T,
): Array<{ startIndex: number; assets: T[] }> {
	const runs: Array<{ startIndex: number; assets: T[] }> = [];
	let startIndex: number | undefined;
	let assets: T[] = [];

	for (const [index, dependency] of dependencies.entries()) {
		if (isEligible(dependency)) {
			startIndex ??= index;
			assets.push(dependency);
			continue;
		}

		if (assets.length > 1 && startIndex !== undefined) runs.push({ startIndex, assets });
		startIndex = undefined;
		assets = [];
	}

	if (assets.length > 1 && startIndex !== undefined) runs.push({ startIndex, assets });
	return runs;
}

function applyPageDependencyPackagingPlan(
	dependencies: AssetDefinition[],
	plan: PageDependencyPackagingPlan,
): AssetDefinition[] {
	const unifiedDependencies: AssetDefinition[] = [];

	for (const [index, dependency] of dependencies.entries()) {
		const stylesheetBundle = plan.stylesheetBundles.get(index);
		if (stylesheetBundle) {
			unifiedDependencies.push(stylesheetBundle);
			continue;
		}
		if (plan.bundledStylesheetMembers.has(index)) continue;

		const scriptBundle = plan.scriptBundles.get(index);
		if (scriptBundle) {
			unifiedDependencies.push(scriptBundle);
			continue;
		}
		if (plan.bundledScriptMembers.has(index)) continue;

		unifiedDependencies.push(dependency);
	}

	return unifiedDependencies;
}

/**
 * Rewrites eligible flat dependency declarations into page-owned stylesheet and script bundles.
 *
 * Only consecutive assets with the default attribute shape and without explicit packaging roles are
 * collapsed so integration-specific, lazy, or custom-attribute assets keep their declared order.
 */
export function packagePageDependencies(
	dependencies: AssetDefinition[],
	integrationName: string,
	bundlesPageDependencies: boolean,
): AssetDefinition[] {
	if (!shouldBundlePageDependencies(bundlesPageDependencies)) {
		return dependencies;
	}

	const plan = createPageDependencyPackagingPlan(dependencies, integrationName);
	if (!plan) {
		return dependencies;
	}

	return applyPageDependencyPackagingPlan(dependencies, plan);
}
