/**
 * JavaScript HMR Strategy
 *
 * Handles hot module replacement for JavaScript and TypeScript entrypoints.
 * Bundles files, replaces bare specifiers, and injects HMR boilerplate.
 *
 * @module
 */

import path from 'node:path';
import type { BunPlugin } from 'bun';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy';
import { appLogger } from '../../global/app-logger';

/**
 * Context interface providing access to HmrManager state.
 * Required for JsHmrStrategy to access registered entrypoints and configuration.
 */
export interface JsHmrContext {
	/**
	 * Map of registered entrypoints to their output URLs.
	 */
	getWatchedFiles(): Map<string, string>;

	/**
	 * Map of bare specifiers to vendor URLs for import resolution.
	 */
	getSpecifierMap(): Map<string, string>;

	/**
	 * Directory where HMR bundles are written.
	 */
	getDistDir(): string;

	/**
	 * Bun plugins to use during bundling.
	 */
	getPlugins(): BunPlugin[];

	/**
	 * Absolute path to the source directory.
	 */
	getSrcDir(): string;
}

/**
 * Strategy for handling JavaScript/TypeScript file changes with hot reloading.
 *
 * This strategy rebuilds all registered entrypoints when any file changes,
 * as we don't currently track dependencies. This is safe but inefficient.
 *
 * The processing steps are:
 * 1. Check if any entrypoints are registered
 * 2. Rebuild all entrypoints (the changed file could be a dependency)
 * 3. Replace bare specifiers with vendor URLs
 * 4. Inject generic HMR boilerplate
 * 5. Broadcast update events for each rebuilt entrypoint
 *
 * @remarks
 * Future enhancement: Track dependencies using Bun's transpiler API to only
 * rebuild affected entrypoints instead of all of them.
 *
 * @see https://bun.sh/docs/runtime/transpiler
 *
 * @example
 * ```typescript
 * const context = {
 *   getWatchedFiles: () => watchedFilesMap,
 *   getSpecifierMap: () => specifierMap,
 *   getDistDir: () => '/path/to/dist/_hmr',
 *   getPlugins: () => [],
 *   getSrcDir: () => '/path/to/src'
 * };
 * const strategy = new JsHmrStrategy(context);
 * ```
 */
export class JsHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.SCRIPT;

	constructor(private context: JsHmrContext) {
		super();
	}

	/**
	 * Determines if the file is a JS/TS file that could affect registered entrypoints.
	 *
	 * Matches if:
	 * 1. There are registered entrypoints to rebuild
	 * 2. The changed file is a JS/TS file in the src directory
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this file should trigger entrypoint rebuilds
	 */
	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		const isJsTs = /\.(ts|tsx|js|jsx)$/.test(filePath);
		const isInSrc = filePath.startsWith(this.context.getSrcDir());

		if (watchedFiles.size === 0) {
			return false;
		}

		return isJsTs && isInSrc;
	}

	/**
	 * Processes a file change by rebuilding all registered entrypoints.
	 *
	 * @param _filePath - Absolute path to the changed file
	 * @returns Action to broadcast update events
	 */
	async process(_filePath: string): Promise<HmrAction> {
		appLogger.debug(`[JsHmrStrategy] Processing ${_filePath}`);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`[JsHmrStrategy] No watched files to rebuild`);
			return { type: 'none' };
		}

		const updates: string[] = [];
		let reloadRequired = false;

		for (const [entrypoint, outputUrl] of watchedFiles.entries()) {
			const result = await this.bundleEntrypoint(entrypoint, outputUrl);
			if (result.success) {
				updates.push(outputUrl);
				if (result.requiresReload) {
					reloadRequired = true;
				}
			}
		}

		if (updates.length > 0) {
			if (reloadRequired) {
				appLogger.debug(`[JsHmrStrategy] Full reload required (no HMR accept found)`);
				return {
					type: 'broadcast',
					event: {
						type: 'reload',
					},
				};
			}

			return {
				type: 'broadcast',
				events: updates.map((path) => ({
					type: 'update',
					path,
					timestamp: Date.now(),
				})),
			};
		}

		return { type: 'none' };
	}

	/**
	 * Bundles a single entrypoint and processes the output.
	 *
	 * @param entrypointPath - Absolute path to the source file
	 * @param outputUrl - URL path for the bundled file
	 * @returns True if bundling was successful
	 */
	private async bundleEntrypoint(
		entrypointPath: string,
		outputUrl: string,
	): Promise<{ success: boolean; requiresReload: boolean }> {
		try {
			const srcDir = this.context.getSrcDir();
			const relativePath = path.relative(srcDir, entrypointPath);
			const relativePathJs = relativePath.replace(/\.(tsx?|jsx?)$/, '.js');
			const outputPath = path.join(this.context.getDistDir(), relativePathJs);

			const result = await Bun.build({
				entrypoints: [entrypointPath],
				outdir: this.context.getDistDir(),
				naming: relativePathJs,
				target: 'browser',
				format: 'esm',
				plugins: this.context.getPlugins(),
				minify: false,
				external: ['react', 'react-dom'],
			});

			if (!result.success) {
				appLogger.error(`[JsHmrStrategy] Failed to build ${entrypointPath}:`, result.logs);
				return { success: false, requiresReload: false };
			}

			return await this.processOutput(outputPath, outputUrl);
		} catch (error) {
			appLogger.error(`[JsHmrStrategy] Error bundling ${entrypointPath}:`, error as Error);
			return { success: false, requiresReload: false };
		}
	}

	/**
	 * Processes bundled output by replacing specifiers and injecting HMR code.
	 *
	 * @param filepath - Path to the bundled output file
	 * @param url - URL path for the bundled file
	 * @returns True if processing was successful and update should be broadcast
	 */
	private async processOutput(filepath: string, url: string): Promise<{ success: boolean; requiresReload: boolean }> {
		try {
			let code = await Bun.file(filepath).text();

			if (code.includes('/* [ecopages] hmr */')) {
				/**
				 * Already processed, assume it supports HMR if it has the header (legacy safety)
				 * or check specifically for accept
				 */
				return { success: true, requiresReload: !code.includes('import.meta.hot.accept') };
			}

			code = this.replaceBareSpecifiers(code);
			await Bun.write(filepath, code);

			appLogger.debug(`[JsHmrStrategy] Processed ${url}`);

			/**
			 * Implicit HMR check: if the code explicitly accepts HMR, we broadcast update.
			 * Otherwise, we must reload the page to ensure fresh execution (e.g. for Custom Elements or side effects).
			 */
			const hasHmrAccept = code.includes('import.meta.hot.accept');
			return { success: true, requiresReload: !hasHmrAccept };
		} catch (error) {
			appLogger.error(`[JsHmrStrategy] Error processing output for ${url}:`, error as Error);
			return { success: false, requiresReload: false };
		}
	}

	/**
	 * Replaces bare specifiers with vendor URLs.
	 *
	 * Handles both static imports and dynamic imports.
	 *
	 * @param code - The bundled code to transform
	 * @returns The transformed code with vendor URLs
	 */
	private replaceBareSpecifiers(code: string): string {
		const specifierMap = this.context.getSpecifierMap();

		if (specifierMap.size === 0) {
			return code;
		}

		let result = code;
		for (const [bareSpec, vendorUrl] of specifierMap.entries()) {
			const escaped = bareSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			result = result.replace(new RegExp(`from\\s*["']${escaped}["']`, 'g'), `from "${vendorUrl}"`);
			result = result.replace(new RegExp(`import\\(["']${escaped}["']\\)`, 'g'), `import("${vendorUrl}")`);
		}

		return result;
	}
}
