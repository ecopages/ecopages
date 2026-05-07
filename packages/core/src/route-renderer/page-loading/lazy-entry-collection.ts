import type { DependencyLazyTrigger, EcoComponentScriptEntry } from '../../types/public-types.ts';
import type { AssetDefinition } from '../../services/assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';
import { rapidhash } from '../../utils/hash.ts';
import { getLazyTriggerKey } from './lazy-trigger-planning.ts';

type LazyScriptRef = {
	lazyKey: string;
	fallbackUrl?: string;
};

/**
 * Lazy scripts grouped by one trigger declaration.
 */
export type LazyGroup = {
	lazy: DependencyLazyTrigger;
	scripts: LazyScriptRef[];
};

/**
 * Callback used to record one normalized lazy-script registration.
 */
export type RegisterLazyScript = (input: {
	lazy: DependencyLazyTrigger;
	lazyKey: string;
	fallbackUrl?: string;
}) => void;

type CollectLazyEntriesOptions = {
	scriptEntries: Array<string | EcoComponentScriptEntry>;
	componentFile: string;
	componentDir: string;
	integrationName: string;
	dependencies: AssetDefinition[];
	lazyDependencyKeys: Set<string>;
	registerLazyScript: RegisterLazyScript;
	resolveDependencyPath: (componentDir: string, pathUrl: string) => string;
	resolveLazyScripts: (componentDir: string, scripts: string[]) => string;
	createModuleScriptAttributes: (attributes?: Record<string, string>) => Record<string, string>;
	createEcopagesJsxLazyEntryName: (integrationName: string, key: string) => string;
	pushUniqueDependency: (
		keys: Set<string>,
		key: string,
		dependencies: AssetDefinition[],
		dependency: AssetDefinition,
	) => boolean;
	getLazyScriptMissingSrcMessage: () => string;
	isEcopagesJsxIntegration: (integrationName: string) => boolean;
};

function isDependencyEntryObject(entry: string | EcoComponentScriptEntry): entry is EcoComponentScriptEntry {
	return typeof entry === 'object' && entry !== null;
}

function getDependencyEntrySrcOrThrow(entry: EcoComponentScriptEntry, errorMessage: string): string {
	if (!entry.src) {
		throw new Error(errorMessage);
	}

	return entry.src;
}

/**
 * Collects lazy script dependency entries and emits their hidden bundle inputs.
 *
 * This helper also reports the trigger-to-script relationship back to the caller so
 * later stages can build the lazy-trigger manifest without reparsing dependency config.
 */
export function collectLazyScriptEntries(options: CollectLazyEntriesOptions): void {
	const {
		scriptEntries,
		componentFile,
		componentDir,
		integrationName,
		dependencies,
		lazyDependencyKeys,
		registerLazyScript,
		resolveDependencyPath,
		resolveLazyScripts,
		createModuleScriptAttributes,
		createEcopagesJsxLazyEntryName,
		pushUniqueDependency,
		getLazyScriptMissingSrcMessage,
		isEcopagesJsxIntegration,
	} = options;

	for (const [index, scriptEntry] of scriptEntries.entries()) {
		if (!isDependencyEntryObject(scriptEntry) || !scriptEntry.lazy) {
			continue;
		}

		const lazy = scriptEntry.lazy;
		const content = scriptEntry.content;
		const src = scriptEntry.src;
		const attributes = scriptEntry.attributes;

		if (content) {
			const lazyKey = `lazy:${rapidhash(`${componentFile}:entry:${index}:${content}`).toString(16)}`;
			const depKey = `lazy:entry:content:${getLazyTriggerKey(lazy)}:${content}:${JSON.stringify(attributes ?? {})}`;
			pushUniqueDependency(
				lazyDependencyKeys,
				depKey,
				dependencies,
				AssetFactory.createContentScript({
					position: 'head',
					content,
					excludeFromHtml: true,
					attributes: {
						...createModuleScriptAttributes(attributes),
						'data-eco-lazy-key': lazyKey,
					},
				}),
			);

			registerLazyScript({
				lazy,
				lazyKey,
			});
			continue;
		}

		const script = src ?? getDependencyEntrySrcOrThrow(scriptEntry, getLazyScriptMissingSrcMessage());
		const resolvedPath = resolveDependencyPath(componentDir, script);
		const fallbackUrl = resolveLazyScripts(componentDir, [script]).split(',')[0] ?? '';
		const lazyKey = `lazy:${rapidhash(`${resolvedPath}:${getLazyTriggerKey(lazy)}`).toString(16)}`;
		const lazyEntryName = createEcopagesJsxLazyEntryName(
			integrationName,
			`${resolvedPath}:${getLazyTriggerKey(lazy)}`,
		);
		const depKey = `lazy:entry:file:${getLazyTriggerKey(lazy)}:${resolvedPath}:${JSON.stringify(attributes ?? {})}`;

		pushUniqueDependency(
			lazyDependencyKeys,
			depKey,
			dependencies,
			isEcopagesJsxIntegration(integrationName)
				? AssetFactory.createContentScript({
						name: lazyEntryName,
						position: 'head',
						content: `import ${JSON.stringify(resolvedPath)};`,
						excludeFromHtml: true,
						bundleOptions: {
							splitting: false,
						},
						attributes: {
							...createModuleScriptAttributes(attributes),
							'data-eco-lazy-key': lazyKey,
						},
					})
				: AssetFactory.createFileScript({
						filepath: resolvedPath,
						position: 'head',
						excludeFromHtml: true,
						attributes: {
							...createModuleScriptAttributes(attributes),
							'data-eco-lazy-key': lazyKey,
						},
					}),
		);

		registerLazyScript({
			lazy,
			lazyKey,
			fallbackUrl,
		});
	}
}