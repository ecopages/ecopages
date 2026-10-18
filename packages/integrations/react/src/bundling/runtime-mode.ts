/**
 * Production runtime check for React bundle and hydration policy.
 *
 * @remarks
 * Uses the same runtime mode helper as the build and request pipelines.
 */
import { isProductionRuntime } from '@ecopages/core/build';

export function isReactProductionRuntime(): boolean {
	return isProductionRuntime();
}
