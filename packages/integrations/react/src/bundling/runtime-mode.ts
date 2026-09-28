/**
 * Production runtime check for React bundle and hydration policy.
 *
 * @remarks
 * Matches core `isProductionRuntime` (`NODE_ENV === 'production'`) without a new
 * `@ecopages/core` export. Keeping this boundary shared ensures hosted-development
 * runtime imports and production bundle optimizations use the same definition.
 */
export function isReactProductionRuntime(): boolean {
	return process.env.NODE_ENV === 'production';
}
