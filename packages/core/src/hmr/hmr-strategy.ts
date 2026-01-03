import type { ClientBridgeEvent } from '../public-types';

/**
 * HMR Strategy Pattern
 *
 * This module defines the base classes and types for Hot Module Replacement strategies.
 * Each strategy handles a specific type of file change and determines how to process it.
 *
 * @module
 * @example
 * ```typescript
 * class CustomHmrStrategy extends HmrStrategy {
 *   readonly type = HmrStrategyType.INTEGRATION;
 *
 *   matches(filePath: string): boolean {
 *     return filePath.endsWith('.custom');
 *   }
 *
 *   async process(filePath: string): Promise<HmrAction> {
 *     return {
 *       type: 'broadcast',
 *       events: [{ type: 'update', path: filePath, timestamp: Date.now() }]
 *     };
 *   }
 * }

 * Defines the category of an HMR strategy, which determines its execution priority.
 * Strategies are evaluated in descending order: INTEGRATION → ASSET → SCRIPT → FALLBACK.
 *
 * @remarks
 * The numeric values represent base priorities. Strategies can fine-tune their priority
 * using the `priorityOffset` property.
 */
export enum HmrStrategyType {
	/**
	 * Integration-specific strategies (React, Lit, etc.)
	 * Highest priority to allow framework-specific HMR handling.
	 */
	INTEGRATION = 100,

	/**
	 * Asset processing strategies (CSS, images, etc.)
	 * High priority for specialized asset handling.
	 */
	ASSET = 50,

	/**
	 * Generic script bundling strategies (JS/TS)
	 * Medium priority for standard script processing.
	 */
	SCRIPT = 25,

	/**
	 * Fallback strategy for unhandled file types.
	 * Lowest priority, triggers full page reload.
	 */
	FALLBACK = 0,
}

/**
 * Represents an action to be taken after processing a file change.
 */
export interface HmrAction {
	/**
	 * Whether to broadcast an HMR event to connected clients.
	 */
	type: 'broadcast' | 'none';

	/**
	 * The HMR events to broadcast, if type is 'broadcast'.
	 * capable of broadcasting multiple events at once.
	 */
	events?: ClientBridgeEvent[];
}

/**
 * Base class for HMR strategies.
 *
 * Each strategy handles a specific type of file change and determines how to process it.
 * Strategies are selected based on their priority (higher values are evaluated first) and
 * whether they match the changed file path.
 *
 * @remarks
 * Strategies should be stateless and idempotent. The same file change should always
 * produce the same result when processed by the same strategy.
 *
 * @example
 * ```typescript
 * class MyAssetStrategy extends HmrStrategy {
 *   readonly type = HmrStrategyType.ASSET;
 *   readonly priorityOffset = 5;
 *
 *   matches(filePath: string): boolean {
 *     return /\.(png|jpg|svg)$/.test(filePath);
 *   }
 *
 *   async process(filePath: string): Promise<HmrAction> {
 *     await this.optimizeImage(filePath);
 *     return {
 *       type: 'broadcast',
 *       events: [{ type: 'update', path: filePath, timestamp: Date.now() }]
 *     };
 *   }
 * }
 * ```
 */
export abstract class HmrStrategy {
	/**
	 * The category of this strategy, determining its base priority.
	 */
	abstract readonly type: HmrStrategyType;

	/**
	 * Optional offset to fine-tune priority within the same category.
	 * Useful when multiple strategies share the same type.
	 *
	 * @defaultValue 0
	 */
	readonly priorityOffset: number = 0;

	/**
	 * Computed priority for strategy selection.
	 * Higher values are evaluated first.
	 *
	 * @returns The sum of the strategy type and priority offset
	 */
	get priority(): number {
		return this.type + this.priorityOffset;
	}

	/**
	 * Determines if this strategy can handle the given file path.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this strategy should process the file
	 *
	 * @example
	 * ```typescript
	 * matches(filePath: string): boolean {
	 *   return filePath.endsWith('.css');
	 * }
	 * ```
	 */
	abstract matches(filePath: string): boolean;

	/**
	 * Processes a file change and returns the action to take.
	 *
	 * This method may perform side effects such as:
	 * - Rebuilding files
	 * - Writing to disk
	 * - Transforming code
	 * - Updating caches
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns Action to take (broadcast event or none)
	 *
	 * @example
	 * ```typescript
	 * async process(filePath: string): Promise<HmrAction> {
	 *   const processed = await this.transform(filePath);
	 *   await Bun.write(outputPath, processed);
	 *
	 *   return {
	 *     type: 'broadcast',
	 *     events: [{ type: 'update', path: outputPath, timestamp: Date.now() }]
	 *   };
	 * }
	 * ```
	 */
	abstract process(filePath: string): Promise<HmrAction>;
}
