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

/**
 * Normalizes bundler module ids so one transform can serve Ecopages loaders
 * and future bundler adapters.
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
 * Returns the app-owned source transforms in stable registration order.
 */
export function getAppSourceTransforms(appConfig: EcoPagesAppConfig): EcoSourceTransform[] {
	return appConfig.sourceTransforms ? Array.from(appConfig.sourceTransforms.values()) : [];
}

/**
 * Converts app-owned source transforms into `transform` plugins, placed after `plugins`.
 *
 * @remarks
 * A transform whose name is already the name of a plugin in `plugins` throws, because the request would
 * otherwise run one of them and not the other.
 */
export function mergeSourceTransformPlugins(
	plugins: EcoBuildPlugin[],
	transforms: readonly EcoSourceTransform[],
): EcoBuildPlugin[] {
	const names = new Set(plugins.map((plugin) => plugin.name));
	for (const transform of transforms) {
		if (names.has(transform.name)) {
			throw new Error(`Source transform "${transform.name}" has the name of a build plugin of the same request.`);
		}
	}
	const extra = [...transforms]
		.sort((left, right) => getSourceTransformEnforceOrder(left) - getSourceTransformEnforceOrder(right))
		.map(createEcoBuildPluginFromSourceTransform);
	return extra.length === 0 ? plugins : [...plugins, ...extra];
}
