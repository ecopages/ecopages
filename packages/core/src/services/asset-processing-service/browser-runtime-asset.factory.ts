import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { AssetFactory } from './asset.factory.ts';
import type { AssetDefinition } from './assets.types.ts';

export const BROWSER_RUNTIME_SCRIPT_ATTRIBUTES = {
	type: 'module',
	defer: '',
} as const;

export function buildBrowserRuntimeAssetUrl(fileName: string): string {
	return `/${AssetFactory.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
}

export function createBrowserRuntimeScriptAsset(options: {
	importPath: string;
	name: string;
	fileName: string;
	bundleOptions?: {
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