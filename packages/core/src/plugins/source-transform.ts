import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '../build/build-types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

export interface EcoSourceTransformResult {
	code: string;
	map?: unknown;
}

export interface EcoSourceTransform {
	name: string;
	filter: RegExp;
	enforce?: 'pre' | 'post';
	transform(code: string, id: string): EcoSourceTransformResult | string | undefined;
}

export interface EcoViteCompatiblePlugin {
	name: string;
	enforce?: 'pre' | 'post';
	transform(code: string, id: string): EcoSourceTransformResult | string | undefined;
}

/**
 * Normalizes bundler module ids so one transform can serve Ecopages loaders,
 * Vite, and future bundler adapters.
 */
export function normalizeTransformId(id: string): string {
	const queryIndex = id.indexOf('?');
	const hashIndex = id.indexOf('#');
	const endIndex = [queryIndex, hashIndex].filter((index) => index >= 0).sort((left, right) => left - right)[0];

	return endIndex === undefined ? id : id.slice(0, endIndex);
}

/**
 * Applies one source transform if the normalized id matches its filter.
 */
export function applySourceTransform(
	transform: EcoSourceTransform,
	code: string,
	id: string,
): EcoSourceTransformResult | string | undefined {
	const normalizedId = normalizeTransformId(id);

	if (!transform.filter.test(normalizedId)) {
		return undefined;
	}

	return transform.transform(code, normalizedId);
}

function inferLoaderFromPath(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' {
	const extension = path.extname(filePath).toLowerCase();

	switch (extension) {
		case '.ts':
			return 'ts';
		case '.tsx':
			return 'tsx';
		case '.jsx':
			return 'jsx';
		default:
			return 'js';
	}
}

/**
 * Adapts a source transform into the existing Ecopages build-plugin contract.
 */
export function createEcoBuildPluginFromSourceTransform(transform: EcoSourceTransform): EcoBuildPlugin {
	return {
		name: transform.name,
		setup(build) {
			build.onLoad({ filter: transform.filter }, (args) => {
				const filePath = normalizeTransformId(args.path);
				const code = fileSystem.readFileSync(filePath);
				const result = applySourceTransform(transform, code, filePath);

				if (!result) {
					return undefined;
				}

				return {
					contents: typeof result === 'string' ? result : result.code,
					loader: inferLoaderFromPath(filePath),
					resolveDir: path.dirname(filePath),
				};
			});
		},
	};
}

/**
 * Adapts a source transform into a Vite-compatible plugin object.
 *
 * @remarks
 * This intentionally returns a plain object shape so core does not need a hard
 * dependency on `vite` just to author transform primitives.
 */
export function createVitePluginFromSourceTransform(transform: EcoSourceTransform): EcoViteCompatiblePlugin {
	return {
		name: transform.name,
		enforce: transform.enforce,
		transform(code, id) {
			return applySourceTransform(transform, code, id);
		},
	};
}

/**
 * Returns the app-owned source transforms in stable registration order.
 */
export function getAppSourceTransforms(appConfig: EcoPagesAppConfig): EcoSourceTransform[] {
	return Array.from(appConfig.sourceTransforms.values());
}

/**
 * Adapts the app-owned source transforms into Vite-compatible plugin objects.
 */
export function createVitePluginsFromAppSourceTransforms(appConfig: EcoPagesAppConfig): EcoViteCompatiblePlugin[] {
	return getAppSourceTransforms(appConfig).map((transform) => createVitePluginFromSourceTransform(transform));
}
