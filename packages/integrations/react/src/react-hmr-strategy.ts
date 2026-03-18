/**
 * React HMR Strategy
 *
 * Handles hot module replacement for React components.
 * Triggers module invalidation on changes to ensure fresh component re-renders.
 *
 * @module
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { FileNotFoundError, fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import type { DefaultHmrContext, EcoComponentConfig } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { injectHmrHandler } from './utils/hmr-scripts.ts';
import { createRuntimeSpecifierAliasPlugin } from './utils/runtime-specifier-alias-plugin.ts';
import { createClientGraphBoundaryPlugin } from './utils/client-graph-boundary-plugin.ts';
import { collectPageDeclaredModules, collectPageDeclaredModulesFromModule } from './utils/declared-modules.ts';
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
 * 3. Preserve integration runtime aliases during browser bundling
 * 4. Inject HMR acceptance handler
 * 5. Broadcast update events for each rebuilt entrypoint
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
	private readonly knownEntrypoints = new Set<string>();

	private async importNodePageModule(entrypointPath: string): Promise<{
		default?: { config?: EcoComponentConfig };
		config?: EcoComponentConfig;
	}> {
		const srcDir = this.context.getSrcDir();
		const rootDir = path.dirname(srcDir);
		const outdir = path.join(path.resolve(this.context.getDistDir(), '..', '..'), '.server-modules');
		const fileBaseName = path.basename(entrypointPath, path.extname(entrypointPath));
		const fileHash = fileSystem.hash(entrypointPath);
		const outputFileName = `${fileBaseName}-${fileHash}.js`;

		const buildResult = await this.context.getBuildExecutor().build({
			entrypoints: [entrypointPath],
			root: rootDir,
			outdir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			naming: outputFileName,
		});

		if (!buildResult.success) {
			const details = buildResult.logs.map((log) => log.message).join(' | ');
			throw new Error(`Error transpiling React HMR page module: ${details}`);
		}

		const preferredOutputPath = path.join(outdir, outputFileName);
		const compiledOutput =
			buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
			buildResult.outputs.find((output) => output.path.endsWith('.js'))?.path;

		if (!compiledOutput) {
			throw new Error(`No transpiled output generated for React HMR page module: ${entrypointPath}`);
		}

		return (await import(pathToFileURL(compiledOutput).href)) as {
			default?: { config?: EcoComponentConfig };
			config?: EcoComponentConfig;
		};
	}

	/**
	 * Redirects `use-sync-external-store/shim` imports to React's built-in
	 * `useSyncExternalStore`.
	 *
	 * Libraries like React Aria still list `use-sync-external-store` as a
	 * dependency to support React 16/17. On React 18+ the `/shim` export is
	 * already a pass-through, but without this plugin esbuild would bundle
	 * the full CJS shim (including `process.env` branching) into the browser
	 * bundle. The plugin short-circuits the resolution so only a single clean
	 * ESM re-export is emitted.
	 */
	private createUseSyncExternalStoreShimPlugin(): EcoBuildPlugin {
		return {
			name: 'react-hmr-use-sync-external-store-shim',
			setup(build) {
				build.onResolve({ filter: /^use-sync-external-store\/shim(?:\/index\.js)?$/ }, () => ({
					path: 'use-sync-external-store/shim',
					namespace: 'ecopages-react-hmr-shim',
				}));

				build.onLoad(
					{ filter: /^use-sync-external-store\/shim$/, namespace: 'ecopages-react-hmr-shim' },
					() => ({
						contents: "export { useSyncExternalStore } from 'react';",
						loader: 'js',
					}),
				);

				build.onLoad({ filter: /[\\/]use-sync-external-store[\\/]shim[\\/]index\.js$/ }, () => ({
					contents: "export { useSyncExternalStore } from 'react';",
					loader: 'js',
				}));

				build.onLoad(
					{
						filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.development\.js$/,
					},
					() => ({
						contents: "export { useSyncExternalStore } from 'react';",
						loader: 'js',
					}),
				);
			},
		};
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
	constructor(
		private context: DefaultHmrContext,
		private pageMetadataCache: ReactHmrPageMetadataCache,
		mdxCompilerOptions?: CompileOptions,
		private explicitGraphEnabled = false,
	) {
		super();
		this.mdxCompilerOptions = mdxCompilerOptions;
	}

	/**
	 * Returns build plugins for React HMR bundling.
	 *
	 * Includes the client graph boundary plugin to prevent undeclared imports
	 * (including `node:*`) from breaking the browser bundle.
	 */
	private getBuildPlugins(declaredModules?: string[]): EcoBuildPlugin[] {
		const allowSpecifiers = [
			'@ecopages/core',
			'react',
			'react-dom',
			'react/jsx-runtime',
			'react/jsx-dev-runtime',
			'react-dom/client',
			...Array.from(this.context.getSpecifierMap().keys()),
		];

		const runtimeAliasPlugin = createRuntimeSpecifierAliasPlugin(this.context.getSpecifierMap());

		return [
			createClientGraphBoundaryPlugin({
				absWorkingDir: path.dirname(this.context.getSrcDir()),
				alwaysAllowSpecifiers: allowSpecifiers,
				declaredModules,
			}),
			...(runtimeAliasPlugin ? [runtimeAliasPlugin] : []),
			...this.context.getPlugins(),
			this.createUseSyncExternalStoreShimPlugin(),
		];
	}

	private isReactEntrypoint(filePath: string): boolean {
		if (filePath.endsWith('.tsx')) {
			return true;
		}

		return filePath.endsWith('.mdx') && this.mdxCompilerOptions !== undefined;
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

		const entrypointsToBuild =
			!this.knownEntrypoints.has(_filePath) && watchedFiles.has(_filePath)
				? [[_filePath, watchedFiles.get(_filePath)!]]
				: watchedFiles.entries();
		this.knownEntrypoints.add(_filePath);

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

			const result = await this.context.getBuildExecutor().build({
				entrypoints: [entrypointPath],
				outdir: tempDir,
				naming: `[name].[hash].tmp`,
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
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
