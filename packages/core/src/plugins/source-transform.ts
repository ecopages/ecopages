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
 * the transform only rewrites module source. Builds run it as a `transform`
 * hook after first-wins `onLoad`, so metadata injection still sees rewritten
 * modules and can return a source map.
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
 * Used when chaining transforms in tests and Vite-facing helpers. The Rolldown
 * plugin bridge runs each transform as a `transform` hook instead.
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

/**
 * Adapts a source transform into an {@link EcoBuildPlugin} `transform` hook.
 *
 * @remarks
 * `transform` runs after first-wins `onLoad`, so metadata injection still sees
 * rewritten modules and can return a source map.
 */
export function createEcoBuildPluginFromSourceTransform(transform: EcoSourceTransform): EcoBuildPlugin {
	return {
		name: transform.name,
		setup(build) {
			build.transform({ filter: transform.filter }, (code, id) => {
				return applySourceTransform(transform, code, id);
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
 * Converts app-owned source transforms into `transform` plugins, skipping names
 * already present in `plugins`.
 */
export function mergeSourceTransformPlugins(
	plugins: EcoBuildPlugin[],
	transforms: readonly EcoSourceTransform[],
): EcoBuildPlugin[] {
	const names = new Set(plugins.map((plugin) => plugin.name));
	const extra = [...transforms]
		.sort((left, right) => getSourceTransformEnforceOrder(left) - getSourceTransformEnforceOrder(right))
		.filter((transform) => !names.has(transform.name))
		.map(createEcoBuildPluginFromSourceTransform);
	return extra.length === 0 ? plugins : [...plugins, ...extra];
}

/**
 * Adapts the app-owned source transforms into Vite-compatible plugin objects.
 */
export function createVitePluginsFromAppSourceTransforms(appConfig: EcoPagesAppConfig): EcoViteCompatiblePlugin[] {
	return getAppSourceTransforms(appConfig).map((transform) => createVitePluginFromSourceTransform(transform));
}
