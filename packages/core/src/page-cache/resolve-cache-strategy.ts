import type { GetCacheStrategyContext, StaticCacheStrategyInput } from '../types/contracts.ts';
import type { CacheStrategy } from './cache.types.ts';

/**
 * Resolves the Cache Strategy a Page declares for one render.
 *
 * @remarks
 * A function is called with the render's props, Params and Query, so each page of a dynamic route can carry its own
 * tags. Any other value is returned as declared, and `undefined` stays `undefined` so the caller applies
 * `cache.defaultStrategy`. An error the function throws fails the render.
 *
 * @param source - The Page file, named in the error when the function returns `'dynamic'`.
 * @throws When the function returns `'dynamic'`. Its type rejects that: a Page that is not cached declares
 * `cache: 'dynamic'` itself, so it also gets its request. This catches a function whose types do not.
 */
export function resolveCacheStrategy<T>(
	declared: StaticCacheStrategyInput<T> | 'dynamic' | undefined,
	context: GetCacheStrategyContext<T>,
	source: string,
): CacheStrategy | undefined {
	if (typeof declared !== 'function') return declared;
	const strategy = declared(context) as CacheStrategy;
	if (strategy === 'dynamic') {
		throw new Error(
			`[ecopages] The cache function of ${source} returned 'dynamic'. A Page that is rendered on every request declares cache: 'dynamic' itself, which also gives its props hook the request.`,
		);
	}
	return strategy;
}
