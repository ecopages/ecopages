/**
 * JavaScript HMR Strategy
 *
 * Handles hot module replacement for JavaScript and TypeScript entrypoints.
 * Bundles files, inspects the emitted output, and decides whether the browser
 * can hot-accept the change or must reload.
 *
 * @module
 */

import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy';
import { appLogger } from '../../global/app-logger';
import { getTranspileOptions } from '../../build/build-adapter.ts';
import type { BuildExecutor } from '../../build/build-adapter.ts';
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

	/**
	 * Build executor used to bundle changed entrypoints.
	 */
	getBuildExecutor(): BuildExecutor;

	/**
	 * Returns whether a watched entrypoint should be rebuilt by the generic JS strategy.
	 *
	 * @remarks
	 * Integrations with higher-priority HMR strategies can use this to keep the
	 * generic JS strategy from overwriting their emitted entrypoints when a shared
	 * dependency changes.
	 */
	shouldProcessEntrypoint?(entrypointPath: string): boolean;
}

/**
 * Strategy for handling JavaScript/TypeScript file changes with hot reloading.
 *
 * The processing steps are:
 * 1. Check if any entrypoints are registered
 * 2. Rebuild impacted entrypoints, or all watched entrypoints when no runtime
 *    dependency graph is available
 * 3. Emit rebuilt entrypoint bundles for browser delivery
 * 4. Inject generic HMR boilerplate
 * 5. Broadcast update events for each rebuilt entrypoint
 *
 * @remarks
 * Node can provide dependency-graph metadata, so this strategy can rebuild only
 * the entrypoints impacted by a changed dependency. Runtimes that do not expose
 * that metadata intentionally keep the rebuild-all fallback.
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
	 * When multiple entrypoints are impacted they are bundled in a single esbuild
	 * invocation to share AST parsing and chunk deduplication.
	 * @returns Action to broadcast update events
	 */
	async process(filePath: string): Promise<HmrAction> {
		appLogger.debug(`[JsHmrStrategy] Processing ${filePath}`);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`[JsHmrStrategy] No watched files to rebuild`);
			return { type: 'none' };
		}

		const dependencyHits = this.context.getDependencyEntrypoints?.(filePath) ?? new Set<string>();
		const hasDependencyHit = dependencyHits.size > 0;
		const impactedEntrypoints = hasDependencyHit
			? Array.from(dependencyHits).filter((entrypoint) => watchedFiles.has(entrypoint))
			: Array.from(watchedFiles.keys());
		const buildableEntrypoints = impactedEntrypoints.filter(
			(entrypoint) => this.context.shouldProcessEntrypoint?.(entrypoint) ?? true,
		);

		if (!hasDependencyHit) {
			appLogger.debug('[JsHmrStrategy] Dependency graph miss, rebuilding all watched entrypoints');
		}

		if (buildableEntrypoints.length === 0) {
			return { type: 'none' };
		}

		const buildResult = await this.bundleEntrypoints(buildableEntrypoints);

		if (!buildResult.success) {
			return { type: 'none' };
		}

		const updates: string[] = [];
		let reloadRequired = false;

		for (const entrypoint of buildableEntrypoints) {
			const outputUrl = watchedFiles.get(entrypoint);
			if (!outputUrl) continue;

			if (buildResult.dependencies && this.context.setEntrypointDependencies) {
				const entrypointDeps = buildResult.dependencies.get(path.resolve(entrypoint)) ?? [];
				this.context.setEntrypointDependencies(entrypoint, entrypointDeps);
			}

			const srcDir = this.context.getSrcDir();
			const relativePath = path.relative(srcDir, entrypoint);
			const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');
			const outputPath = path.join(this.context.getDistDir(), relativePathJs);

			const result = await this.processOutput(outputPath, outputUrl);
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
					events: [{ type: 'reload' }],
				};
			}

			return {
				type: 'broadcast',
				events: updates.map((p) => ({
					type: 'update',
					path: p,
					timestamp: Date.now(),
				})),
			};
		}

		return { type: 'none' };
	}

	/**
	 * Bundles one or more entrypoints in a single esbuild invocation.
	 * Uses the source directory as the output base so that the directory structure
	 * is preserved under the HMR dist folder.
	 */
	private async bundleEntrypoints(
		entrypoints: string[],
	): Promise<{ success: boolean; dependencies?: Map<string, string[]> }> {
		try {
			const result = await this.context.getBuildExecutor().build({
				entrypoints,
				outdir: this.context.getDistDir(),
				outbase: this.context.getSrcDir(),
				naming: '[dir]/[name]',
				...getTranspileOptions('hmr-entrypoint'),
				plugins: this.context.getPlugins(),
				minify: false,
			});

			if (!result.success) {
				appLogger.error('[JsHmrStrategy] Batched build failed:', result.logs);
				return { success: false };
			}

			const dependencies = new Map<string, string[]>();
			if (result.dependencyGraph?.entrypoints) {
				for (const [entrypoint, deps] of Object.entries(result.dependencyGraph.entrypoints)) {
					dependencies.set(path.resolve(entrypoint), deps);
				}
			}

			return { success: true, dependencies };
		} catch (error) {
			appLogger.error('[JsHmrStrategy] Error in batched build:', error as Error);
			return { success: false };
		}
	}

	/**
	 * Processes bundled output and determines whether the browser can hot-accept
	 * the update or must fall back to a full reload.
	 *
	 * @param filepath - Path to the bundled output file
	 * @param url - URL path for the bundled file
	 * @returns True if processing was successful and update should be broadcast
	 */
	private async processOutput(filepath: string, url: string): Promise<{ success: boolean; requiresReload: boolean }> {
		try {
			const code = await fileSystem.readFile(filepath);

			if (code.includes('/* [ecopages] hmr */')) {
				// Legacy safety: previously processed bundles already carry the marker.
				return { success: true, requiresReload: !code.includes('import.meta.hot.accept') };
			}

			appLogger.debug(`[JsHmrStrategy] Processed ${url}`);

			const hasHmrAccept = code.includes('import.meta.hot.accept');
			return { success: true, requiresReload: !hasHmrAccept };
		} catch (error) {
			appLogger.error(`[JsHmrStrategy] Error processing output for ${url}:`, error as Error);
			return { success: false, requiresReload: false };
		}
	}
}
