import type { EcoBuildPlugin } from '../../../build/build-types.ts';
import { AssetFactory } from './asset.factory.ts';
import type { AssetDefinition } from './assets.types.ts';
import {
	createBrowserRuntimeEntryModule,
	type BrowserRuntimeEntryModuleConfig,
} from './browser-runtime-entry.factory.ts';

export const BROWSER_RUNTIME_SCRIPT_ATTRIBUTES = {
	type: 'module',
	defer: '',
} as const;

/**
 * Builds the public vendor URL used for generated browser runtime assets.
 */
export function buildBrowserRuntimeAssetUrl(fileName: string): string {
	return `/${AssetFactory.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
}

/**
 * Declares a browser runtime script asset backed by one importable module.
 *
 * @remarks
 * Runtime assets are emitted as excluded head scripts because integrations often
 * need the bundler output and specifier registration without injecting the raw
 * asset directly into HTML during dependency resolution.
 */
export function createBrowserRuntimeScriptAsset(options: {
	importPath: string;
	name: string;
	fileName: string;
	bundleOptions?: {
		define?: Record<string, string>;
		minify?: boolean;
		external?: string[];
		naming?: string;
		plugins?: EcoBuildPlugin[];
	};
	attributes?: Record<string, string>;
}): AssetDefinition {
	return AssetFactory.createNodeModuleScript({
		position: 'head',
		importPath: options.importPath,
		name: options.name,
		excludeFromHtml: true,
		bundleOptions: {
			naming: options.fileName,
			...options.bundleOptions,
		},
		attributes: {
			...BROWSER_RUNTIME_SCRIPT_ATTRIBUTES,
			...(options.attributes ?? {}),
		},
	});
}

/**
 * Creates a browser runtime asset from a generated re-export entry module.
 *
 * @remarks
 * This is the shared "module list -> generated entry file -> runtime asset"
 * path used by integrations that need browser-side runtime bundles without
 * owning bespoke entry-file generation logic.
 */
export function createBrowserRuntimeModuleAsset(options: {
	modules: BrowserRuntimeEntryModuleConfig[];
	name: string;
	fileName: string;
	cacheDirName?: string;
	rootDir?: string;
	bundleOptions?: {
		define?: Record<string, string>;
		minify?: boolean;
		external?: string[];
		naming?: string;
		plugins?: EcoBuildPlugin[];
	};
	attributes?: Record<string, string>;
}): AssetDefinition {
	const importPath = createBrowserRuntimeEntryModule({
		modules: options.modules,
		fileName: `${options.name}-entry.mjs`,
		rootDir: options.rootDir,
		cacheDirName: options.cacheDirName,
	});

	return createBrowserRuntimeScriptAsset({
		importPath,
		name: options.name,
		fileName: options.fileName,
		bundleOptions: options.bundleOptions,
		attributes: options.attributes,
	});
}
