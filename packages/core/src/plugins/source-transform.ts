import type { EcoBuildPlugin, EcoBuildTransform } from '../build/contracts/build-types.ts';
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
 * the transform only rewrites module source. Builds run source transforms in the
 * bundler's transform hook, after the module is loaded, so metadata injection and
 * similar passes still run on output rewritten by `onLoad` plugins. Return `map`
 * when the edit moves code, so stack traces and source maps keep pointing at the
 * source the author wrote.
 */
export interface EcoSourceTransform {
	/** Stable transform name. */
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

const sourceTransformFunctions = new WeakMap<EcoBuildTransform['handler'], EcoSourceTransform['transform']>();

/**
 * Returns the function whose source identifies a build transform handler.
 *
 * @remarks
 * A handler made by {@link createEcoBuildPluginFromSourceTransform} only
 * forwards to the source transform, so cache keys fingerprint the source
 * transform's own `transform` instead.
 *
 * @internal
 */
export function resolveTransformHandlerIdentity(handler: EcoBuildTransform['handler']): (...args: never[]) => unknown {
	return sourceTransformFunctions.get(handler) ?? handler;
}

/**
 * Adapts a source transform into a build plugin that runs it in the bundler's
 * transform hook.
 *
 * @remarks
 * The handler calls `transform.transform` as a method, so a class-based
 * transform keeps its `this`.
 */
export function createEcoBuildPluginFromSourceTransform(transform: EcoSourceTransform): EcoBuildPlugin {
	const handler: EcoBuildTransform['handler'] = (code, id) => transform.transform(code, id);
	sourceTransformFunctions.set(handler, transform.transform);
	return {
		name: transform.name,
		setup() {},
		transform: {
			filter: transform.filter,
			order: transform.enforce,
			handler,
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
