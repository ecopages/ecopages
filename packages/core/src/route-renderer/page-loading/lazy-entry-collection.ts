import type { DependencyLazyTrigger, EcoComponentScriptEntry } from '../../types/public-types.ts';
import type { AssetDefinition } from '../../services/assets/asset-processing-service/index.ts';
import {
	APP_BROWSER_CLIENT_BUNDLE_ID,
	AssetFactory,
	createAppBrowserClientEntry,
} from '../../services/assets/asset-processing-service/index.ts';
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
			const lazyEntryName = createEcopagesJsxLazyEntryName(integrationName, depKey);
			pushUniqueDependency(
				lazyDependencyKeys,
				depKey,
				dependencies,
				AssetFactory.createContentScript({
					position: 'head',
					name: lazyEntryName,
					content,
					excludeFromHtml: true,
					bundle: true,
					groupedBundle: {
						id: APP_BROWSER_CLIENT_BUNDLE_ID,
						entryName: lazyEntryName,
					},
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
			createAppBrowserClientEntry({
				entryName: lazyEntryName,
				importPath: resolvedPath,
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
