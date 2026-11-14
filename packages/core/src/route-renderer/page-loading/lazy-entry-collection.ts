import type { DependencyLazyTrigger, EcoComponentScriptEntry } from '../../types/contracts.ts';
import type { AssetDefinition } from '../../assets/asset-processing-service/index.ts';
import {
	APP_BROWSER_CLIENT_BUNDLE_ID,
	AssetFactory,
	createAppBrowserClientEntry,
} from '../../assets/asset-processing-service/index.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import { getLazyTriggerKey } from './lazy-trigger-planning.ts';
import { createModuleScriptAttributes, resolveDeclaredPath } from './declared-asset-collection.ts';

type LazyScriptRef = {
	lazyKey: string;
	fallbackUrl?: string;
};

/** The lazy scripts of one component that share a trigger. */
export type LazyGroup = {
	lazy: DependencyLazyTrigger;
	scripts: LazyScriptRef[];
};

/**
 * One lazy script a component declares.
 *
 * @remarks
 * Its client entry is named for the Integration that owns the component, which collection supplies, so the
 * entry is created then from `entryHash`.
 */
export type DeclaredLazyScript = LazyScriptRef & {
	lazy: DependencyLazyTrigger;
	/** Dedupes the entry within a collection pass. */
	key: string;
	entryHash: string;
	createAsset(entryName: string): AssetDefinition;
};

type DeclareLazyScriptEntriesOptions = {
	scriptEntries: Array<string | EcoComponentScriptEntry>;
	rootDir: string;
	componentFile: string;
	componentDir: string;
	resolveLazyScripts: (componentDir: string, scripts: string[]) => string;
	lazyScriptMissingSrcMessage: string;
};

function declareContentLazyScript(
	entry: EcoComponentScriptEntry & { lazy: DependencyLazyTrigger; content: string },
	index: number,
	options: DeclareLazyScriptEntriesOptions,
): DeclaredLazyScript {
	const { lazy, content, attributes } = entry;
	const lazyKey = `lazy:${contentHash(`${toRootRelativePath(options.rootDir, options.componentFile)}:entry:${index}:${content}`, 16)}`;
	const key = `lazy:entry:content:${getLazyTriggerKey(lazy)}:${content}:${JSON.stringify(attributes ?? {})}`;
	return {
		lazy,
		lazyKey,
		key,
		entryHash: contentHash(key, 16),
		createAsset: (entryName) =>
			AssetFactory.createContentScript({
				position: 'head',
				name: entryName,
				content,
				excludeFromHtml: true,
				bundle: true,
				groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName },
				attributes: { ...createModuleScriptAttributes(attributes), 'data-eco-lazy-key': lazyKey },
			}),
	};
}

function declareFileLazyScript(
	entry: EcoComponentScriptEntry & { lazy: DependencyLazyTrigger },
	options: DeclareLazyScriptEntriesOptions,
): DeclaredLazyScript {
	const { lazy, attributes } = entry;
	if (!entry.src) throw new Error(options.lazyScriptMissingSrcMessage);

	const importPath = resolveDeclaredPath(options.componentDir, entry.src);
	const sourceKey = toRootRelativePath(options.rootDir, importPath);
	const triggerKey = getLazyTriggerKey(lazy);
	const lazyKey = `lazy:${contentHash(`${sourceKey}:${triggerKey}`, 16)}`;
	return {
		lazy,
		lazyKey,
		fallbackUrl: options.resolveLazyScripts(options.componentDir, [entry.src]).split(',')[0] ?? '',
		key: `lazy:entry:file:${triggerKey}:${importPath}:${JSON.stringify(attributes ?? {})}`,
		entryHash: contentHash(`${sourceKey}:${triggerKey}`, 16),
		createAsset: (entryName) =>
			createAppBrowserClientEntry({
				entryName,
				importPath,
				attributes: { ...createModuleScriptAttributes(attributes), 'data-eco-lazy-key': lazyKey },
			}),
	};
}

/**
 * Normalizes a component's lazy script declarations into hidden app browser client entries.
 *
 * @remarks
 * Each entry carries a `data-eco-lazy-key`, from the component file and its content or from the source and its
 * trigger, so it does not depend on declaration order.
 */
export function declareLazyScriptEntries(options: DeclareLazyScriptEntriesOptions): DeclaredLazyScript[] {
	const declared: DeclaredLazyScript[] = [];
	for (const [index, entry] of options.scriptEntries.entries()) {
		if (typeof entry !== 'object' || entry === null || !entry.lazy) continue;
		const lazyEntry = entry as EcoComponentScriptEntry & { lazy: DependencyLazyTrigger };
		declared.push(
			lazyEntry.content
				? declareContentLazyScript({ ...lazyEntry, content: lazyEntry.content }, index, options)
				: declareFileLazyScript(lazyEntry, options),
		);
	}
	return declared;
}
