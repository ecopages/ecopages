import type {
	EcoComponentScriptEntry,
	EcoComponentStylesheetEntry,
} from '../../types/public-types.ts';
import type { AssetDefinition } from '../../services/assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../services/assets/asset-processing-service/index.ts';

type CollectDeclaredAssetEntriesOptions = {
	stylesheetEntries: Array<string | EcoComponentStylesheetEntry>;
	scriptEntries: Array<string | EcoComponentScriptEntry>;
	componentDir: string;
	dependencies: AssetDefinition[];
	stylesheetDependencyKeys: Set<string>;
	scriptDependencyKeys: Set<string>;
	resolveDependencyPath: (componentDir: string, pathUrl: string) => string;
	createModuleScriptAttributes: (attributes?: Record<string, string>) => Record<string, string>;
	pushUniqueDependency: (
		keys: Set<string>,
		key: string,
		dependencies: AssetDefinition[],
		dependency: AssetDefinition,
	) => boolean;
	getInvalidStylesheetEntryMessage: () => string;
	getInvalidScriptEntryMessage: () => string;
};

function isDependencyEntryObject(
	entry: string | EcoComponentScriptEntry | EcoComponentStylesheetEntry,
): entry is EcoComponentScriptEntry | EcoComponentStylesheetEntry {
	return typeof entry === 'object' && entry !== null;
}

function getDependencyEntrySrc(
	entry: string | EcoComponentScriptEntry | EcoComponentStylesheetEntry,
): string | undefined {
	return isDependencyEntryObject(entry) ? entry.src : entry;
}

function getDependencyEntryContent(
	entry: string | EcoComponentScriptEntry | EcoComponentStylesheetEntry,
): string | undefined {
	return isDependencyEntryObject(entry) ? entry.content : undefined;
}

function getDependencyEntryAttributes(
	entry: string | EcoComponentScriptEntry | EcoComponentStylesheetEntry,
): Record<string, string> | undefined {
	return isDependencyEntryObject(entry) ? entry.attributes : undefined;
}

/**
 * Normalizes non-lazy stylesheet and script declarations into asset definitions.
 *
 * Duplicate declarations are filtered through the provided key sets so callers can
 * compose this helper into larger recursive collection passes without re-emitting
 * the same asset multiple times.
 */
export function collectDeclaredAssetEntries(options: CollectDeclaredAssetEntriesOptions): void {
	const {
		stylesheetEntries,
		scriptEntries,
		componentDir,
		dependencies,
		stylesheetDependencyKeys,
		scriptDependencyKeys,
		resolveDependencyPath,
		createModuleScriptAttributes,
		pushUniqueDependency,
		getInvalidStylesheetEntryMessage,
		getInvalidScriptEntryMessage,
	} = options;

	for (const style of stylesheetEntries) {
		const content = getDependencyEntryContent(style);
		const src = getDependencyEntrySrc(style);
		const attributes = getDependencyEntryAttributes(style);

		if (content) {
			const depKey = `style:content:${content}:${JSON.stringify(attributes ?? {})}`;
			pushUniqueDependency(
				stylesheetDependencyKeys,
				depKey,
				dependencies,
				AssetFactory.createContentStylesheet({
					content,
					position: 'head',
					attributes,
				}),
			);
			continue;
		}

		if (!src) {
			throw new Error(getInvalidStylesheetEntryMessage());
		}

		const resolvedPath = resolveDependencyPath(componentDir, src);
		const depKey = `style:file:${resolvedPath}:${JSON.stringify(attributes ?? {})}`;
		pushUniqueDependency(
			stylesheetDependencyKeys,
			depKey,
			dependencies,
			AssetFactory.createFileStylesheet({
				filepath: resolvedPath,
				position: 'head',
				attributes: {
					rel: 'stylesheet',
					...attributes,
				},
			}),
		);
	}

	for (const script of scriptEntries) {
		if (isDependencyEntryObject(script) && 'lazy' in script && script.lazy) {
			continue;
		}

		const content = getDependencyEntryContent(script);
		const src = getDependencyEntrySrc(script);
		const attributes = getDependencyEntryAttributes(script);

		if (content) {
			const depKey = `script:content:${content}:${JSON.stringify(attributes ?? {})}`;
			pushUniqueDependency(
				scriptDependencyKeys,
				depKey,
				dependencies,
				AssetFactory.createInlineContentScript({
					position: 'head',
					content,
					bundle: false,
					attributes,
				}),
			);
			continue;
		}

		if (!src) {
			throw new Error(getInvalidScriptEntryMessage());
		}

		const resolvedPath = resolveDependencyPath(componentDir, src);
		const depKey = `script:file:${resolvedPath}:${JSON.stringify(attributes ?? {})}`;
		pushUniqueDependency(
			scriptDependencyKeys,
			depKey,
			dependencies,
			AssetFactory.createFileScript({
				filepath: resolvedPath,
				position: 'head',
				attributes: createModuleScriptAttributes(attributes),
			}),
		);
	}
}