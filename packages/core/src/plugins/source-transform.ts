import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

export interface EcoSourceTransformResult {
	code: string;
	map?: unknown;
}

/**
 * Bundler-neutral source transform registered on {@link EcoPagesAppConfig.sourceTransforms}.
 *
 * @remarks
 * Prefer this shape over a competing {@link EcoBuildPlugin} `onLoad` handler when
 * the transform only rewrites module source. Browser/HMR builds run source
 * transforms after first-wins `onLoad` plugins, so metadata injection and similar
 * passes still run on rewritten output from boundary/runtime plugins.
 */
export interface EcoSourceTransform {
	/** Stable transform name. Also used to dedupe loader plugins in browser builds. */
	name: string;
	/** File-path filter tested against {@link normalizeTransformId | normalized ids}. */
	filter: RegExp;
	/** Runs before default transforms, or after them when set to `post`. */
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

const SOURCE_TRANSFORM_ENFORCE_ORDER: Record<NonNullable<EcoSourceTransform['enforce']> | 'default', number> = {
	pre: 0,
	default: 1,
	post: 2,
};

function getSourceTransformEnforceOrder(transform: EcoSourceTransform): number {
	return SOURCE_TRANSFORM_ENFORCE_ORDER[transform.enforce ?? 'default'];
}

/**
 * Applies app-owned source transforms in deterministic `pre` → default → `post` order.
 *
 * @remarks
 * Used by the Rolldown plugin bridge after `onLoad` plugins produce final module
 * contents. Transforms that do not match `filter` are skipped; matching transforms
 * are chained left-to-right on the current source string.
 *
 * @param transforms - App-owned transforms, usually from {@link getAppSourceTransforms}.
 * @param code - Current module source.
 * @param id - Module id forwarded to each transform after query/hash normalization.
 * @returns The transformed source, or the original `code` when no transform matches.
 */
export function applySourceTransforms(transforms: readonly EcoSourceTransform[], code: string, id: string): string {
	let current = code;

	for (const transform of [...transforms].sort(
		(left, right) => getSourceTransformEnforceOrder(left) - getSourceTransformEnforceOrder(right),
	)) {
		const result = applySourceTransform(transform, current, id);
		if (!result) {
			continue;
		}

		current = typeof result === 'string' ? result : result.code;
	}

	return current;
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
 *
 * @remarks
 * Server-oriented builds and loader registration still use this adapter.
 * Browser/HMR builds should register the transform in `appConfig.sourceTransforms`
 * instead so the Rolldown bridge can run it after competing `onLoad` plugins.
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
	return appConfig.sourceTransforms ? Array.from(appConfig.sourceTransforms.values()) : [];
}

/**
 * Adapts the app-owned source transforms into Vite-compatible plugin objects.
 */
export function createVitePluginsFromAppSourceTransforms(appConfig: EcoPagesAppConfig): EcoViteCompatiblePlugin[] {
	return getAppSourceTransforms(appConfig).map((transform) => createVitePluginFromSourceTransform(transform));
}
