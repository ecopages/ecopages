import type { EcoComponentScriptEntry, EcoComponentStylesheetEntry } from '../../types/contracts.ts';
import type { AssetDefinition } from '../../assets/asset-processing-service/index.ts';
import { AssetFactory } from '../../assets/asset-processing-service/index.ts';
import { path } from '@ecopages/file-system/path';

/** One declared stylesheet or eager script, with the key that dedupes it within a collection pass. */
export type DeclaredAsset = { kind: 'stylesheet' | 'script'; key: string; asset: AssetDefinition };

type DeclareAssetEntriesOptions = {
	stylesheetEntries: Array<string | EcoComponentStylesheetEntry>;
	scriptEntries: Array<string | EcoComponentScriptEntry>;
	componentDir: string;
	errors: { invalidStylesheetEntry: string; invalidScriptEntry: string };
};

/** Resolves a declared asset path against the directory of the component that declares it. */
export function resolveDeclaredPath(componentDir: string, pathUrl: string): string {
	return path.isAbsolute(pathUrl) ? pathUrl : path.join(componentDir, pathUrl);
}

/** Script attributes a declared module script gets unless it overrides them. */
export function createModuleScriptAttributes(attributes?: Record<string, string>): Record<string, string> {
	return { type: 'module', defer: '', ...attributes };
}

function isDependencyEntryObject(
	entry: string | EcoComponentScriptEntry | EcoComponentStylesheetEntry,
): entry is EcoComponentScriptEntry | EcoComponentStylesheetEntry {
	return typeof entry === 'object' && entry !== null;
}

function readEntry(entry: string | EcoComponentScriptEntry | EcoComponentStylesheetEntry): {
	src?: string;
	content?: string;
	attributes?: Record<string, string>;
} {
	return isDependencyEntryObject(entry)
		? { src: entry.src, content: entry.content, attributes: entry.attributes }
		: { src: entry };
}

function declareStylesheet(
	style: string | EcoComponentStylesheetEntry,
	componentDir: string,
	invalidEntry: string,
): DeclaredAsset {
	const { src, content, attributes } = readEntry(style);
	if (content) {
		return {
			kind: 'stylesheet',
			key: `style:content:${content}:${JSON.stringify(attributes ?? {})}`,
			asset: AssetFactory.createContentStylesheet({ content, position: 'head', attributes }),
		};
	}
	if (!src) throw new Error(invalidEntry);

	const filepath = resolveDeclaredPath(componentDir, src);
	return {
		kind: 'stylesheet',
		key: `style:file:${filepath}:${JSON.stringify(attributes ?? {})}`,
		asset: AssetFactory.createFileStylesheet({
			filepath,
			position: 'head',
			attributes: { rel: 'stylesheet', ...attributes },
		}),
	};
}

function declareScript(
	script: string | EcoComponentScriptEntry,
	componentDir: string,
	invalidEntry: string,
): DeclaredAsset {
	const { src, content, attributes } = readEntry(script);
	if (content) {
		return {
			kind: 'script',
			key: `script:content:${content}:${JSON.stringify(attributes ?? {})}`,
			asset: AssetFactory.createInlineContentScript({ position: 'head', content, bundle: false, attributes }),
		};
	}
	if (!src) throw new Error(invalidEntry);

	const filepath = resolveDeclaredPath(componentDir, src);
	return {
		kind: 'script',
		key: `script:file:${filepath}:${JSON.stringify(attributes ?? {})}`,
		asset: AssetFactory.createFileScript({
			filepath,
			position: 'head',
			attributes: createModuleScriptAttributes(attributes),
		}),
	};
}

/**
 * Normalizes a component's stylesheet and non-lazy script declarations into asset definitions, stylesheets first.
 *
 * @remarks
 * Each carries the key collection dedupes it by, so the same declaration from two components is emitted once.
 */
export function declareAssetEntries(options: DeclareAssetEntriesOptions): DeclaredAsset[] {
	const { componentDir, errors } = options;
	return [
		...options.stylesheetEntries.map((style) =>
			declareStylesheet(style, componentDir, errors.invalidStylesheetEntry),
		),
		...options.scriptEntries
			.filter((script) => !(isDependencyEntryObject(script) && 'lazy' in script && script.lazy))
			.map((script) => declareScript(script, componentDir, errors.invalidScriptEntry)),
	];
}
