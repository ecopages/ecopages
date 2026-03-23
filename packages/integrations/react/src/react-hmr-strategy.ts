/**
 * React HMR Strategy
 *
 * Handles hot module replacement for React components.
 * Triggers module invalidation on changes to ensure fresh component re-renders.
 *
 * @module
 */

import path from 'node:path';

import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { createRuntimeSpecifierAliasPlugin } from '@ecopages/core/build/runtime-specifier-alias-plugin';
import { FileNotFoundError, fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import type { DefaultHmrContext } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { injectHmrHandler } from './utils/hmr-scripts.ts';
import { createClientGraphBoundaryPlugin } from './utils/client-graph-boundary-plugin.ts';
import { collectPageDeclaredModules, collectPageDeclaredModulesFromModule } from './utils/declared-modules.ts';
import { getReactClientGraphAllowSpecifiers } from './utils/react-runtime-specifier-map.ts';
import { createUseSyncExternalStoreShimPlugin } from './utils/use-sync-external-store-shim-plugin.ts';
import type { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';

const appLogger = new Logger('[ReactHmrStrategy]');

/**
 * Strategy for handling React component HMR updates.
 *
 * This strategy provides React-specific HMR handling by rebuilding entrypoints
 * and injecting HMR acceptance handlers that trigger module invalidation.
 *
 * The processing steps are:
 * 1. Check if any React entrypoints are registered
 * 2. Rebuild all React entrypoints (the changed file could be a dependency)
 * 3. Rebuild browser output through the shared browser bundle service while
 *    preserving React-specific runtime aliases and graph policy
 * 4. Read page config metadata through the shared server-module loading path
 * 5. Inject HMR acceptance handler
 * 6. Broadcast update events for each rebuilt entrypoint
 *
 * @remarks
 * This strategy has higher priority than generic JsHmrStrategy, allowing it
 * to handle React files specially while falling back to generic handling for
 * non-React files.
 *
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
 *   getSrcDir: () => '/path/to/src',
 *   getLayoutsDir: () => '/path/to/src/layouts'
 * };
 * const strategy = new ReactHmrStrategy(context);
 * ```
 */
export class ReactHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;
	private mdxCompilerOptions?: CompileOptions;
	private readonly ownedTemplateExtensions: Set<string>;
	private readonly allTemplateExtensions: string[];
	private async importNodePageModule(entrypointPath: string): Promise<{
		default?: { config?: Record<string, unknown> };
		config?: Record<string, unknown>;
	}> {
		return await this.context.importServerModule(entrypointPath);
	}

	/**
	 * Creates a new React HMR strategy instance.
	 *
	 * @param context - The HMR context providing access to watched files, plugins, build directories,
	 *                  and the layouts directory for detecting layout file changes that require full
	 *                  page reloads instead of module-level HMR updates.
	 * @param pageMetadataCache - React-only cache of declared browser modules discovered during
	 *                            server rendering. This avoids re-importing unchanged page modules
	 *                            during save-time Fast Refresh rebuilds.
	 * @param mdxCompilerOptions - Optional MDX compiler options for processing .mdx files
	 * @param explicitGraphEnabled - Enables explicit graph mode for React HMR bundling.
	 * In explicit mode, HMR builds omit AST server-only stripping plugins in React paths.
	 */
	private context: DefaultHmrContext;
	private pageMetadataCache: ReactHmrPageMetadataCache;
	private explicitGraphEnabled: boolean;

	constructor(
		context: DefaultHmrContext,
		pageMetadataCache: ReactHmrPageMetadataCache,
		mdxCompilerOptions?: CompileOptions,
		ownedTemplateExtensions: string[] = ['.tsx'],
		allTemplateExtensions: string[] = ['.tsx'],
		explicitGraphEnabled = false,
	) {
		super();
		this.context = context;
		this.pageMetadataCache = pageMetadataCache;
		this.explicitGraphEnabled = explicitGraphEnabled;
		this.mdxCompilerOptions = mdxCompilerOptions;
		this.ownedTemplateExtensions = new Set(ownedTemplateExtensions);
		this.allTemplateExtensions = [...allTemplateExtensions].sort((a, b) => b.length - a.length);
	}

	/**
	 * Returns build plugins for React HMR bundling.
	 *
	 * Includes the client graph boundary plugin to prevent undeclared imports
	 * (including `node:*`) from breaking the browser bundle.
	 */
	private getBuildPlugins(declaredModules?: string[]): EcoBuildPlugin[] {
		const allowSpecifiers = getReactClientGraphAllowSpecifiers(this.context.getSpecifierMap().keys());

		const runtimeAliasPlugin = createRuntimeSpecifierAliasPlugin(this.context.getSpecifierMap(), {
			name: 'react-hmr-runtime-specifier-alias',
		});

		return [
			createClientGraphBoundaryPlugin({
				absWorkingDir: path.dirname(this.context.getSrcDir()),
				alwaysAllowSpecifiers: allowSpecifiers,
				declaredModules,
			}),
			...(runtimeAliasPlugin ? [runtimeAliasPlugin] : []),
			...this.context.getPlugins(),
			createUseSyncExternalStoreShimPlugin({
				name: 'react-hmr-use-sync-external-store-shim',
				namespace: 'ecopages-react-hmr-shim',
			}),
		];
	}

	private isReactEntrypoint(filePath: string): boolean {
		if (filePath.endsWith('.mdx')) {
			return this.mdxCompilerOptions !== undefined;
		}

		if (!filePath.endsWith('.tsx')) {
			return false;
		}

		if (!this.isRouteTemplate(filePath)) {
			return true;
		}

		const templateExtension = this.resolveTemplateExtension(filePath);
		if (!templateExtension) {
			return false;
		}

		return this.ownedTemplateExtensions.has(templateExtension);
	}

	/**
	 * Returns true when a route file uses a compound extension like `page.foo.tsx`.
	 *
	 * @remarks
	 * React integration owns plain `.tsx` route templates. Compound extensions in
	 * pages/layouts are integration-specific route templates and should not be
	 * claimed by React HMR strategy.
	 */
	private isRouteTemplate(filePath: string): boolean {
		return filePath.startsWith(this.context.getPagesDir()) || filePath.startsWith(this.context.getLayoutsDir());
	}

	private resolveTemplateExtension(filePath: string): string | undefined {
		return this.allTemplateExtensions.find((extension) => filePath.endsWith(extension));
	}

	/**
	 * Determines if the file is a React/MDX entrypoint that's registered for HMR.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this is a registered React or MDX entrypoint
	 */
	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		appLogger.debug(`Checking ${filePath}. Watched: ${watchedFiles.size}`);
		if (watchedFiles.size === 0) {
			return false;
		}

		return this.isReactEntrypoint(filePath);
	}

	/**
	 * Checks if a file is a layout file.
	 *
	 * Layout files require special HMR handling because they wrap multiple pages and affect
	 * the entire page structure. When a layout changes, we trigger a 'layout-update' event
	 * instead of a regular 'update' event, which instructs the browser to perform a full
	 * page reload (or clear cache and re-render) rather than attempting module-level HMR.
	 *
	 * @param filePath - Absolute path to the file
	 * @returns True if the file is in the layouts directory
	 */
	private isLayoutFile(filePath: string): boolean {
		return filePath.startsWith(this.context.getLayoutsDir());
	}

	/**
	 * Processes a React file change by rebuilding all React entrypoints.
	 *
	 * For layout files, broadcasts a 'layout-update' event to trigger full page reload.
	 * For regular components/pages, broadcasts 'update' events for module-level HMR.
	 * When a page entrypoint is first registered, only that entrypoint is built.
	 * Subsequent file updates rebuild all watched React entrypoints as usual.
	 *
	 * @param _filePath - Absolute path to the changed file
	 * @returns Action to broadcast update events (layout-update for layouts, update for components)
	 */
	async process(_filePath: string): Promise<HmrAction> {
		appLogger.debug(`Processing ${_filePath}`);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`No watched files`);
			return { type: 'none' };
		}

		const isLayout = this.isLayoutFile(_filePath);
		if (isLayout) {
			appLogger.debug(`Detected layout file change: ${_filePath}`);
		}

		const changedEntrypointOutput = watchedFiles.get(_filePath);
		const entrypointsToBuild = changedEntrypointOutput
			? [[_filePath, changedEntrypointOutput]]
			: watchedFiles.entries();

		const updates: string[] = [];
		for (const [entrypoint, outputUrl] of entrypointsToBuild) {
			if (!this.isReactEntrypoint(entrypoint)) {
				continue;
			}

			appLogger.debug(`Bundling ${entrypoint}`);
			const success = await this.bundleReactEntrypoint(entrypoint, outputUrl);
			if (success) {
				updates.push(outputUrl);
			}
		}

		if (updates.length > 0) {
			if (isLayout) {
				appLogger.debug(`Layout update detected, sending layout-update event`);
				return {
					type: 'broadcast',
					events: [
						{
							type: 'layout-update',
						},
					],
				};
			}

			appLogger.debug(`Broadcasting ${updates.length} updates`);
			return {
				type: 'broadcast',
				events: updates.map((path) => ({
					type: 'update',
					path,
					timestamp: Date.now(),
				})),
			};
		}

		appLogger.debug(`No updates generated`);
		return { type: 'none' };
	}

	/**
	 * Bundles a single React/MDX entrypoint with HMR support.
	 *
	 * @param entrypointPath - Absolute path to the source file
	 * @param outputUrl - URL path for the bundled file
	 * @returns True if bundling was successful
	 */
	private async bundleReactEntrypoint(entrypointPath: string, outputUrl: string): Promise<boolean> {
		try {
			const isMdx = entrypointPath.endsWith('.mdx');
			const srcDir = this.context.getSrcDir();
			const relativePath = path.relative(srcDir, entrypointPath);
			const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx)$/, '.js');
			const encodedPathJs = this.encodeDynamicSegments(relativePathJs);
			const outputPath = path.join(this.context.getDistDir(), encodedPathJs);
			const tempDir = path.dirname(outputPath);

			const declaredModules = this.pageMetadataCache.getDeclaredModules(entrypointPath)
				? this.pageMetadataCache.getDeclaredModules(entrypointPath)!
				: isMdx
					? await collectPageDeclaredModules(entrypointPath)
					: collectPageDeclaredModulesFromModule(await this.importNodePageModule(entrypointPath));
			const plugins = this.getBuildPlugins(declaredModules);

			if (isMdx && this.mdxCompilerOptions) {
				const { createReactMdxLoaderPlugin } = await import('./utils/react-mdx-loader-plugin.ts');
				const mdxPlugin = createReactMdxLoaderPlugin(this.mdxCompilerOptions);
				plugins.unshift(mdxPlugin);
			}

			const result = await this.context.getBrowserBundleService().bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [entrypointPath],
				outdir: tempDir,
				naming: `[name].[hash].tmp`,
				plugins,
				minify: false,
			});

			if (!result.success) {
				appLogger.error(`Failed to build ${entrypointPath}:`, result.logs);
				return false;
			}

			const tempFile = result.outputs[0]?.path;
			if (!tempFile) {
				appLogger.error(`No output file generated for ${entrypointPath}`);
				return false;
			}

			const processed = await this.processOutput(tempFile, outputPath, outputUrl);
			return processed;
		} catch (error) {
			appLogger.error(`Error bundling ${entrypointPath}:`, error as Error);
			return false;
		}
	}

	/**
	 * Encodes dynamic route segments (brackets) in file paths.
	 * Converts `[slug]` to `_slug_` to avoid filesystem issues.
	 */
	private encodeDynamicSegments(filepath: string): string {
		return filepath.replace(/\[([^\]]+)\]/g, '_$1_');
	}

	/**
	 * Processes bundled output and injects the React HMR handler.
	 * Writes to temp file first, then renames atomically to avoid conflicts.
	 *
	 * @param tempPath - Path to the temporary bundled file
	 * @param finalPath - Final destination path
	 * @param url - URL path for logging
	 * @returns True if processing was successful
	 */
	private async processOutput(tempPath: string, finalPath: string, url: string): Promise<boolean> {
		if (!fileSystem.exists(tempPath)) {
			appLogger.debug(`Skipping stale temp output for ${url}: ${tempPath}`);
			return false;
		}

		try {
			let code = await fileSystem.readFile(tempPath);

			code = injectHmrHandler(code);

			await fileSystem.writeAsync(finalPath, code);
			await fileSystem.removeAsync(tempPath).catch(() => {});

			appLogger.debug(`Processed ${url} with HMR handler`);
			return true;
		} catch (error) {
			if (
				error instanceof FileNotFoundError ||
				(error instanceof Error && error.message.includes('not found')) ||
				(error instanceof Error && 'code' in error && error.code === 'ENOENT')
			) {
				appLogger.debug(`Skipping stale temp output for ${url}: ${tempPath}`);
				await fileSystem.removeAsync(tempPath).catch(() => {});
				return false;
			}

			appLogger.error(`Error processing output for ${url}:`, error as Error);
			await fileSystem.removeAsync(tempPath).catch(() => {});
			return false;
		}
	}
}
