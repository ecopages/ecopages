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
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy.ts';
import { appLogger } from '../../global/app-logger.ts';
import {
	removeStaleHmrEntrypointOutput,
	resolveHmrEntrypointOutputPaths,
	isRegisteredScriptEntrypoint,
	isHmrOutputFresh,
} from '../hmr-entrypoint-output.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { BrowserBundleExecutor } from '../../services/assets/browser-bundle.service.ts';
import type { EntrypointDependencyGraph } from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';

/**
 * Context interface providing access to HmrManager state.
 * Required for JsHmrStrategy to access registered entrypoints and configuration.
 */
export interface JsHmrContext {
	/**
	 * Map of registered entrypoints to their output URLs.
	 */
	getWatchedFiles(): Map<string, string>;

	getEntrypointDependencyGraph(): EntrypointDependencyGraph;

	/**
	 * Directory where HMR bundles are written.
	 */
	getDistDir(): string;

	/**
	 * Absolute path to the source directory.
	 */
	getSrcDir(): string;

	/**
	 * Absolute path to the pages directory.
	 */
	getPagesDir(): string;

	/**
	 * Absolute path to the layouts directory.
	 */
	getLayoutsDir(): string;

	/**
	 * All configured route-template extensions across integrations.
	 */
	getTemplateExtensions(): string[];

	/**
	 * Browser bundler used to rebuild changed entrypoints.
	 */
	getBrowserBundleService(): BrowserBundleExecutor;

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
 *   getDistDir: () => '/path/to/dist/_hmr',
 *   getPlugins: () => [],
 *   getSrcDir: () => '/path/to/src'
 * };
 * const strategy = new JsHmrStrategy(context);
 * ```
 */
export class JsHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.SCRIPT;
	private context: JsHmrContext;

	constructor(context: JsHmrContext) {
		super();
		this.context = context;
	}

	/**
	 * Determines if the file is a JS/TS file that could affect registered entrypoints.
	 *
	 * Matches if:
	 * 1. There are registered entrypoints to rebuild
	 * 2. The changed file is a JS/TS file in the src directory
	 * 3. Registered entrypoints always match, even when they share an integration template extension
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this file should trigger entrypoint rebuilds
	 */
	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		const resolvedPath = path.resolve(filePath);
		const isJsTs = /\.(ts|tsx|js|jsx)$/.test(resolvedPath);
		const srcDir = path.resolve(this.context.getSrcDir());
		const isInSrc = resolvedPath.startsWith(`${srcDir}${path.sep}`) || resolvedPath === srcDir;
		const isIntegrationTemplate = this.context
			.getTemplateExtensions()
			.some((extension) => resolvedPath.endsWith(extension));

		if (watchedFiles.size === 0) {
			return false;
		}

		if (!isJsTs || !isInSrc) {
			return false;
		}

		if (watchedFiles.has(resolvedPath)) {
			return true;
		}

		if (isIntegrationTemplate) {
			return false;
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
	 * When multiple entrypoints are impacted they are bundled in a single
	 * invocation to share AST parsing and chunk deduplication.
	 * @returns Action to broadcast update events
	 */
	async process(filePath: string): Promise<HmrAction> {
		appLogger.debug(`[JsHmrStrategy] Processing ${filePath}`);
		const watchedFiles = this.context.getWatchedFiles();
		const resolvedChanged = path.resolve(filePath);
		const isRegisteredEntrypointEdit = isRegisteredScriptEntrypoint(watchedFiles, resolvedChanged);

		if (watchedFiles.size === 0) {
			appLogger.debug(`[JsHmrStrategy] No watched files to rebuild`);
			return { type: 'none' };
		}

		const dependencyHits = this.context.getEntrypointDependencyGraph().getDependencyEntrypoints(filePath);
		const hasDependencyHit = dependencyHits.size > 0;
		const impactedEntrypoints = isRegisteredEntrypointEdit
			? [resolvedChanged]
			: hasDependencyHit
				? Array.from(dependencyHits).filter((entrypoint) => watchedFiles.has(path.resolve(entrypoint)))
				: Array.from(watchedFiles.keys());
		const buildableEntrypoints = impactedEntrypoints.filter(
			(entrypoint) => this.context.shouldProcessEntrypoint?.(entrypoint) ?? true,
		);

		if (!hasDependencyHit && !isRegisteredEntrypointEdit) {
			appLogger.debug('[JsHmrStrategy] Dependency graph miss, rebuilding all watched entrypoints');
		}

		if (buildableEntrypoints.length === 0) {
			return { type: 'none' };
		}

		for (const entrypoint of buildableEntrypoints) {
			this.removeStaleEntrypointOutput(this.resolveEntrypointOutputPath(entrypoint));
		}

		const buildResult = await this.bundleEntrypoints(buildableEntrypoints);

		if (!buildResult.success) {
			return { type: 'none' };
		}

		const updates: string[] = [];
		let reloadRequired = false;

		for (const entrypoint of buildableEntrypoints) {
			const resolvedEntrypoint = path.resolve(entrypoint);
			const derivedOutput = resolveHmrEntrypointOutputPaths(
				this.context.getSrcDir(),
				this.context.getDistDir(),
				resolvedEntrypoint,
			);
			const outputUrl = watchedFiles.get(resolvedEntrypoint) ?? derivedOutput.outputUrl;
			const outputPath = this.resolveEntrypointOutputPath(resolvedEntrypoint);

			if (buildResult.dependencies) {
				const entrypointDeps = buildResult.dependencies.get(resolvedEntrypoint) ?? [];
				this.context
					.getEntrypointDependencyGraph()
					.setEntrypointDependencies(resolvedEntrypoint, entrypointDeps);
			}

			const result = await this.processOutput(outputPath, outputUrl, resolvedEntrypoint);
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

	private resolveEntrypointOutputPath(entrypointPath: string): string {
		return resolveHmrEntrypointOutputPaths(this.context.getSrcDir(), this.context.getDistDir(), entrypointPath)
			.outputPath;
	}

	private removeStaleEntrypointOutput(outputPath: string): void {
		removeStaleHmrEntrypointOutput(outputPath, 'JsHmrStrategy');
	}

	/**
	 * Bundles one or more entrypoints in a single build invocation.
	 * Uses the source directory as the output base so that the directory structure
	 * is preserved under the HMR dist folder.
	 */
	private async bundleEntrypoints(
		entrypoints: string[],
	): Promise<{ success: boolean; dependencies?: Map<string, string[]> }> {
		try {
			if (entrypoints.length === 1) {
				const entrypoint = entrypoints[0]!;
				const outputPath = this.resolveEntrypointOutputPath(entrypoint);
				const naming = path.relative(this.context.getDistDir(), outputPath).split(path.sep).join('/');
				const result = await this.context.getBrowserBundleService().bundle({
					profile: 'hmr-entrypoint',
					entrypoints: [entrypoint],
					outdir: this.context.getDistDir(),
					naming,
					minify: false,
				});

				if (!result.success) {
					appLogger.error('[JsHmrStrategy] Entrypoint build failed:', result.logs);
					return { success: false };
				}

				const dependencies = new Map<string, string[]>();
				if (result.dependencyGraph?.entrypoints) {
					for (const [resolvedEntrypoint, deps] of Object.entries(result.dependencyGraph.entrypoints)) {
						dependencies.set(path.resolve(resolvedEntrypoint), deps);
					}
				}

				return { success: true, dependencies };
			}

			const result = await this.context.getBrowserBundleService().bundle({
				profile: 'hmr-entrypoint',
				entrypoints,
				outdir: this.context.getDistDir(),
				outbase: this.context.getSrcDir(),
				naming: '[dir]/[name]',
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
	private async processOutput(
		filepath: string,
		url: string,
		sourcePath?: string,
	): Promise<{ success: boolean; requiresReload: boolean }> {
		try {
			if (sourcePath && !isHmrOutputFresh(filepath, sourcePath)) {
				appLogger.warn(`[JsHmrStrategy] Skipping broadcast for stale HMR output ${url}`);
				return { success: false, requiresReload: false };
			}

			const code = await fileSystem.readFile(filepath);

			if (code.includes('/* [ecopages] hmr */')) {
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
