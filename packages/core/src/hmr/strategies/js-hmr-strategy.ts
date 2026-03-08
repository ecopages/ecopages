/**
 * JavaScript HMR Strategy
 *
 * Handles hot module replacement for JavaScript and TypeScript entrypoints.
 * Bundles files, replaces bare specifiers, and injects HMR boilerplate.
 *
 * @module
 */

import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy';
import { appLogger } from '../../global/app-logger';
import { defaultBuildAdapter } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';

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
	 * Returns entrypoints impacted by a changed dependency path.
	 *
	 * @remarks
	 * This hook is currently provided by the Node HMR manager where dependency
	 * graph metadata is extracted from the Node/esbuild build adapter.
	 */
	getDependencyEntrypoints?(filePath: string): Set<string>;

	/**
	 * Stores latest dependency set for an entrypoint.
	 *
	 * @remarks
	 * This hook is currently used only by the Node HMR manager to maintain a
	 * reverse invalidation index. Runtimes that do not provide it keep rebuild-all
	 * fallback semantics.
	 */
	setEntrypointDependencies?(entrypointPath: string, dependencies: string[]): void;

	/**
	 * Directory where HMR bundles are written.
	 */
	getDistDir(): string;

	/**
	 * Build plugins to use during bundling.
	 */
	getPlugins(): EcoBuildPlugin[];

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

		if (!isJsTs || !isInSrc) {
			return false;
		}

		if (watchedFiles.has(filePath)) {
			return true;
		}

		if (this.context.getDependencyEntrypoints) {
			return this.context.getDependencyEntrypoints(filePath).size > 0;
		}

		return true;
	}

	/**
	 * Processes a file change by rebuilding affected entrypoints.
	 *
	 * @param filePath - Absolute path to the changed file
	 *
	 * @remarks
	 * If runtime-specific dependency graph hooks are unavailable, this strategy
	 * falls back to rebuilding all watched entrypoints.
	 * @returns Action to broadcast update events
	 */
	async process(filePath: string): Promise<HmrAction> {
		appLogger.debug(`[JsHmrStrategy] Processing ${filePath}`);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`[JsHmrStrategy] No watched files to rebuild`);
			return { type: 'none' };
		}

		const updates: string[] = [];
		let reloadRequired = false;
		const dependencyHits = this.context.getDependencyEntrypoints?.(filePath) ?? new Set<string>();
		const hasDependencyHit = dependencyHits.size > 0;
		const impactedEntrypoints = hasDependencyHit
			? Array.from(dependencyHits).filter((entrypoint) => watchedFiles.has(entrypoint))
			: Array.from(watchedFiles.keys());

		if (!hasDependencyHit) {
			appLogger.debug('[JsHmrStrategy] Dependency graph miss, rebuilding all watched entrypoints');
		}

		for (const entrypoint of impactedEntrypoints) {
			const outputUrl = watchedFiles.get(entrypoint);
			if (!outputUrl) {
				continue;
			}

			const result = await this.bundleEntrypoint(entrypoint, outputUrl);
			if (result.success) {
				if (result.dependencies && this.context.setEntrypointDependencies) {
					this.context.setEntrypointDependencies(entrypoint, result.dependencies);
				}

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
					events: [
						{
							type: 'reload',
						},
					],
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
	): Promise<{ success: boolean; requiresReload: boolean; dependencies?: string[] }> {
		try {
			const srcDir = this.context.getSrcDir();
			const relativePath = path.relative(srcDir, entrypointPath);
			const relativePathJs = relativePath.replace(/\.(tsx?|jsx?)$/, '.js');
			const outputPath = path.join(this.context.getDistDir(), relativePathJs);

			const result = await defaultBuildAdapter.build({
				entrypoints: [entrypointPath],
				outdir: this.context.getDistDir(),
				naming: relativePathJs,
				...defaultBuildAdapter.getTranspileOptions('hmr-entrypoint'),
				plugins: this.context.getPlugins(),
				minify: false,
				external: ['react', 'react-dom'],
			});

			if (!result.success) {
				appLogger.error(`[JsHmrStrategy] Failed to build ${entrypointPath}:`, result.logs);
				return { success: false, requiresReload: false, dependencies: undefined };
			}

			const dependencyGraph = result.dependencyGraph?.entrypoints?.[path.resolve(entrypointPath)] ?? [];
			const output = await this.processOutput(outputPath, outputUrl);

			return {
				...output,
				dependencies: dependencyGraph,
			};
		} catch (error) {
			appLogger.error(`[JsHmrStrategy] Error bundling ${entrypointPath}:`, error as Error);
			return { success: false, requiresReload: false, dependencies: undefined };
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
			let code = await fileSystem.readFile(filepath);

			if (code.includes('/* [ecopages] hmr */')) {
				/**
				 * Already processed, assume it supports HMR if it has the header (legacy safety)
				 * or check specifically for accept
				 */
				return { success: true, requiresReload: !code.includes('import.meta.hot.accept') };
			}

			code = this.replaceBareSpecifiers(code);
			await fileSystem.writeAsync(filepath, code);

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
