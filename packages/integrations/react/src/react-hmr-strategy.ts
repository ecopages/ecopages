/**
 * React HMR Strategy
 *
 * Handles hot module replacement for React components with Fast Refresh support.
 * Provides stateful component updates without losing component state.
 *
 * @module
 */

import path from 'node:path';

import { HmrStrategy, HmrStrategyType, type HmrAction, type DefaultHmrContext } from '@ecopages/core';
import { Logger } from '@ecopages/logger';

const appLogger = new Logger('[ReactHmrStrategy]');

/**
 * Strategy for handling React component changes with Fast Refresh.
 *
 * This strategy provides React-specific HMR handling that preserves component
 * state during hot updates. It uses React Fast Refresh to update components
 * in place without losing their state.
 *
 * The processing steps are:
 * 1. Check if any React entrypoints are registered
 * 2. Rebuild all React entrypoints (the changed file could be a dependency)
 * 3. Replace bare specifiers with vendor URLs
 * 4. Inject React Fast Refresh boilerplate
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
 * @see https://github.com/facebook/react/tree/main/packages/react-refresh
 * @see https://bun.sh/docs/runtime/transpiler
 *
 * @example
 * ```typescript
 * const context = {
 *   getWatchedFiles: () => watchedFilesMap,
 *   getSpecifierMap: () => specifierMap,
 *   getDistDir: () => '/path/to/dist/_hmr',
 *   getPlugins: () => []
 * };
 * const strategy = new ReactHmrStrategy(context);
 * ```
 */
export class ReactHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;

	constructor(private context: DefaultHmrContext) {
		super();
	}

	/**
	 * Determines if the file is a React entrypoint (.tsx) that's registered for HMR.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this is a registered React entrypoint
	 */
	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		appLogger.debug(`Checking ${filePath}. Watched: ${watchedFiles.size}`);
		if (watchedFiles.size === 0) {
			return false;
		}

		return filePath.endsWith('.tsx');
	}

	/**
	 * Processes a React file change by rebuilding all React entrypoints.
	 *
	 * @param _filePath - Absolute path to the changed file
	 * @returns Action to broadcast update events
	 */
	async process(_filePath: string): Promise<HmrAction> {
		appLogger.debug(`Processing ${_filePath}`);
		const watchedFiles = this.context.getWatchedFiles();

		if (watchedFiles.size === 0) {
			appLogger.debug(`No watched files`);
			return { type: 'none' };
		}

		const updates: string[] = [];
		for (const [entrypoint, outputUrl] of watchedFiles.entries()) {
			appLogger.debug(`Bundling ${entrypoint}`);
			const success = await this.bundleReactEntrypoint(entrypoint, outputUrl);
			if (success) {
				updates.push(outputUrl);
			}
		}

		if (updates.length > 0) {
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
	 * Bundles a single React entrypoint with Fast Refresh support.
	 *
	 * @param entrypointPath - Absolute path to the source file
	 * @param outputUrl - URL path for the bundled file
	 * @returns True if bundling was successful
	 */
	private async bundleReactEntrypoint(entrypointPath: string, outputUrl: string): Promise<boolean> {
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
				appLogger.error(`Failed to build ${entrypointPath}:`, result.logs);
				return false;
			}

			const processed = await this.processOutput(outputPath, outputUrl);
			return processed;
		} catch (error) {
			appLogger.error(`Error bundling ${entrypointPath}:`, error as Error);
			return false;
		}
	}

	/**
	 * Processes bundled output by replacing specifiers and injecting React Fast Refresh.
	 *
	 * @param filepath - Path to the bundled output file
	 * @param url - URL path for the bundled file
	 * @returns True if processing was successful
	 */
	private async processOutput(filepath: string, url: string): Promise<boolean> {
		try {
			let code = await Bun.file(filepath).text();

			if (code.includes('/* [ecopages] react-hmr */')) {
				return false;
			}

			code = this.replaceBareSpecifiers(code);
			code = this.injectReactFastRefresh(code);
			await Bun.write(filepath, code);

			appLogger.debug(`Processed ${url} with Fast Refresh`);
			return true;
		} catch (error) {
			appLogger.error(`Error processing output for ${url}:`, error as Error);
			return false;
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

	/**
	 * Injects React Fast Refresh boilerplate code.
	 *
	 * This enables stateful hot reloading for React components.
	 * The Fast Refresh runtime preserves component state during updates.
	 *
	 * @param code - The processed code
	 * @returns Code with React Fast Refresh boilerplate injected
	 *
	 * @see https://github.com/facebook/react/tree/main/packages/react-refresh
	 */
	private injectReactFastRefresh(code: string): string {
		return `/* [ecopages] react-hmr */
${code}
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      const exports = Object.keys(newModule);
      const hasReactExport = exports.some(key => {
        const value = newModule[key];
        return value && (
          typeof value === 'function' ||
          (typeof value === 'object' && value.$$typeof)
        );
      });
      
      if (hasReactExport) {
        import.meta.hot.invalidate();
      }
    }
  });
}
`;
	}
}
