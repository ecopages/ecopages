/**
 * Default HMR Strategy
 *
 * Fallback strategy for file types that don't have specialized handling.
 * Triggers a full page reload to ensure changes are reflected.
 *
 * @module
 */

import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy';

/**
 * Default fallback strategy for unhandled file types.
 *
 * This strategy matches all files and triggers a full page reload.
 * It has the lowest priority (FALLBACK) and acts as a catch-all when
 * no other strategy matches the changed file.
 *
 * @remarks
 * This strategy ensures that all file changes result in some action,
 * even if we don't have specialized handling for that file type.
 *
 * @example
 * ```typescript
 * const strategy = new DefaultHmrStrategy();
 * const action = await strategy.process('/path/to/unknown.file');
 * ```
 */
export class DefaultHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.FALLBACK;

	/**
	 * Matches all file paths.
	 *
	 * @param _filePath - Absolute path to the changed file (unused)
	 * @returns Always returns true as this is a catch-all strategy
	 */
	matches(_filePath: string): boolean {
		return true;
	}

	/**
	 * Processes a file change by triggering a full page reload.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns Action to broadcast a reload event
	 */
	async process(filePath: string): Promise<HmrAction> {
		return {
			type: 'broadcast',
			event: {
				type: 'reload',
				path: filePath,
				message: 'fallback-strategy',
			},
		};
	}
}
