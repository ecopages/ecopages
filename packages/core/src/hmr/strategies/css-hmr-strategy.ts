/**
 * CSS HMR Strategy
 *
 * Handles hot module replacement for CSS and CSS preprocessor files.
 * Processes CSS through PostCSS and triggers style updates without page reload.
 *
 * @module
 */

import path from 'node:path';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy';
import { appLogger } from '../../global/app-logger';

/**
 * Context interface providing access to config for CSS processing.
 */
export interface CssHmrContext {
	/**
	 * Source directory relative path (e.g., 'src')
	 */
	getSrcDir(): string;

	/**
	 * Absolute path to the dist directory
	 */
	getDistDir(): string;
}

/**
 * Strategy for handling CSS file changes with hot reloading.
 *
 * This strategy processes CSS files through PostCSS, writes the output
 * to the dist directory, and broadcasts a css-update event to trigger
 * stylesheet refresh in the browser without a full page reload.
 *
 * Supported file extensions: .css, .scss, .sass, .less
 *
 * @remarks
 * The browser-side HMR runtime handles css-update events by updating
 * the href attribute of matching link tags with a cache-busting query parameter.
 *
 * @example
 * ```typescript
 * const context = {
 *   getSrcDir: () => 'src',
 *   getDistDir: () => '/path/to/dist'
 * };
 * const strategy = new CssHmrStrategy(context);
 * if (strategy.matches('/path/to/styles.css')) {
 *   const action = await strategy.process('/path/to/styles.css');
 * }
 * ```
 */
export class CssHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.ASSET;

	constructor(private context: CssHmrContext) {
		super();
	}

	/**
	 * Determines if the file is a CSS or CSS preprocessor file.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if the file has a CSS-related extension
	 */
	matches(filePath: string): boolean {
		return /\.(css|scss|sass|less)$/.test(filePath);
	}

	/**
	 * Processes a CSS file change by running PostCSS and writing the output.
	 *
	 * The processing steps are:
	 * 1. Calculate the relative path from src directory
	 * 2. Determine the output path in dist/assets
	 * 3. Process the CSS through PostCSS
	 * 4. Write the processed CSS to the output path
	 * 5. Broadcast a css-update event with timestamp
	 *
	 * @param filePath - Absolute path to the changed CSS file
	 * @returns Action to broadcast a css-update event
	 */
	async process(filePath: string): Promise<HmrAction> {
		try {
			const relativePath = path.relative(this.context.getSrcDir(), filePath);
			const outputPath = path.join(this.context.getDistDir(), 'assets', relativePath);

			const processedCss = await PostCssProcessor.processPath(filePath);
			await Bun.write(outputPath, processedCss);

			return {
				type: 'broadcast',
				event: {
					type: 'css-update',
					path: filePath,
					timestamp: Date.now(),
				},
			};
		} catch (error) {
			appLogger.error(`[CssHmrStrategy] Failed to process CSS file: ${error}`);

			return {
				type: 'broadcast',
				event: {
					type: 'error',
					message: error instanceof Error ? error.message : String(error),
				},
			};
		}
	}
}
