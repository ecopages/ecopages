import { path } from '@ecopages/file-system/path';
import type { EcoComponentConfig } from '../../types/contracts.ts';
import { getComponentIdentity } from '../../eco/component-identity.ts';
import { resolveDiscoveredStylesheets } from '../../eco/discovered-dependency-paths.ts';
import { declareAssetEntries, resolveDeclaredPath, type DeclaredAsset } from './declared-asset-collection.ts';
import { declareLazyScriptEntries, type DeclaredLazyScript } from './lazy-entry-collection.ts';
import { declareModules, type ModuleDeclaration } from './module-declaration-aggregation.ts';
import { extractEcopagesVirtualImports } from './ecopages-virtual-imports.ts';

/** An inferred stylesheet and whether only a plain module imports it. */
export type InferredStyle = { filepath: string; plainModule: boolean };

/**
 * The assets one component config declares, resolved against the app root.
 *
 * @remarks
 * It covers the config alone, not its nested Components, so collection walks the graph and merges the
 * declarations of each config it reaches.
 */
export type ComponentDeclarations = {
	/** The identity file, absolute. */
	file: string;
	/** Stylesheets, then eager scripts, in declaration order. */
	assets: ReadonlyArray<DeclaredAsset>;
	lazyScripts: ReadonlyArray<DeclaredLazyScript>;
	/** Declared `modules` and the `ecopages:` virtual modules the source imports, in merge order. */
	modules: ReadonlyArray<ModuleDeclaration>;
	explicitStylePaths: ReadonlyArray<string>;
	inferredStyles: ReadonlyArray<InferredStyle>;
	packageStylePaths: ReadonlyMap<string, string>;
	/** Whether the config itself ships a browser script: an eager or lazy script, or a module. */
	declaresScript: boolean;
};

export type ComponentDeclarationErrors = {
	invalidStylesheetEntry: string;
	invalidScriptEntry: string;
	lazyScriptMissingSrc: string;
};

export type ComponentDeclarationStoreOptions = {
	/** The app root that root-relative identity files and discovered stylesheets resolve against. */
	rootDir: string;
	/** Maps lazy script sources to the public URLs used when no build output URL exists. */
	resolveLazyScripts: (componentDir: string, scripts: string[]) => string;
	errors: ComponentDeclarationErrors;
};

/**
 * Names the app browser client entry of a lazy script for the Integration that owns its component.
 *
 * @remarks `entryHash` is {@link DeclaredLazyScript.entryHash}; only the owner varies between renders.
 */
export function createLazyEntryName(integrationName: string, entryHash: string): string {
	return `ecopages-${integrationName}-lazy-${entryHash}`;
}

/**
 * Resolves the declarations of each component config once per app.
 *
 * @remarks
 * A config is a value of the module that declares it, so its declarations are fixed for the life of that module
 * instance: the file paths, the source's virtual imports and the lazy entry keys never change while the config
 * exists. A development edit re-imports the module, and the new config is resolved afresh. Configs are held
 * weakly, so a dropped module instance takes its declarations with it.
 */
export class ComponentDeclarationStore {
	private readonly declarationsByConfig = new WeakMap<EcoComponentConfig, ComponentDeclarations | null>();
	private readonly options: ComponentDeclarationStoreOptions;

	constructor(options: ComponentDeclarationStoreOptions) {
		this.options = options;
	}

	/** Returns the declarations of `config`, or `undefined` when it has no identity file and so takes no part. */
	get(config: EcoComponentConfig): ComponentDeclarations | undefined {
		let declarations = this.declarationsByConfig.get(config);
		if (declarations === undefined) {
			declarations = this.resolve(config);
			this.declarationsByConfig.set(config, declarations);
		}
		return declarations ?? undefined;
	}

	private resolve(config: EcoComponentConfig): ComponentDeclarations | null {
		const identityFile = getComponentIdentity(config)?.file;
		if (!identityFile) return null;

		const { rootDir, errors } = this.options;
		const file = path.resolve(rootDir, identityFile);
		const dir = path.dirname(file);
		const stylesheetEntries = config.dependencies?.stylesheets ?? [];
		const scriptEntries = config.dependencies?.scripts ?? [];
		const discovered = resolveDiscoveredStylesheets(config, rootDir);
		const assets = declareAssetEntries({ stylesheetEntries, scriptEntries, componentDir: dir, errors });
		const lazyScripts = declareLazyScriptEntries({
			scriptEntries,
			rootDir,
			componentFile: file,
			componentDir: dir,
			resolveLazyScripts: this.options.resolveLazyScripts,
			lazyScriptMissingSrcMessage: errors.lazyScriptMissingSrc,
		});
		const modules = declareModules(config.dependencies?.modules, extractEcopagesVirtualImports(file));

		return {
			file,
			assets,
			lazyScripts,
			modules,
			explicitStylePaths: stylesheetEntries
				.map((style) => (typeof style === 'string' ? style : style.src))
				.filter((src): src is string => Boolean(src))
				.map((src) => resolveDeclaredPath(dir, src)),
			inferredStyles: [
				...discovered.imported.map((filepath) => ({ filepath, plainModule: false })),
				...discovered.plainModules.map((filepath) => ({ filepath, plainModule: true })),
			],
			packageStylePaths: discovered.packagePaths,
			declaresScript:
				modules.length > 0 || lazyScripts.length > 0 || assets.some((asset) => asset.kind === 'script'),
		};
	}
}
