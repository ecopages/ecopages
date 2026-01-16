/**
 * MDX HMR Strategy
 *
 * Handles hot module replacement for MDX components with Fast Refresh support.
 * Provides stateful component updates without losing component state.
 *
 * @module
 */

import path from 'node:path';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import mdx from '@mdx-js/esbuild';
import type { CompileOptions } from '@mdx-js/mdx';
import type { DefaultHmrContext } from '@ecopages/core';

export class MdxHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;

	constructor(
		private context: DefaultHmrContext,
		private compilerOptions: CompileOptions = {},
	) {
		super();
	}

	/**
	 * Determines if the file is an MDX file that should be handled by this strategy.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns True if this is an MDX file
	 */
	matches(filePath: string): boolean {
		return filePath.endsWith('.mdx');
	}

	/**
	 * Processes an MDX file change by rebuilding the file.
	 * If the file is not registered, it creates a temporary output path.
	 *
	 * @param filePath - Absolute path to the changed file
	 * @returns Action to broadcast update events
	 */
	async process(filePath: string): Promise<HmrAction> {
		const watchedFiles = this.context.getWatchedFiles();
		let outputUrl = watchedFiles.get(filePath);

		if (!outputUrl) {
			const srcDir = this.context.getSrcDir();
			const relativePath = path.relative(srcDir, filePath);
			const relativePathJs = relativePath.replace(/\.(tsx?|jsx?|mdx?)$/, '.js');

			const urlPath = relativePathJs.split(path.sep).join('/');
			outputUrl = `/assets/_hmr/${urlPath}`;
			watchedFiles.set(filePath, outputUrl);
		}

		const success = await this.bundleMdxEntrypoint(filePath, outputUrl);

		if (success) {
			return {
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: outputUrl,
						timestamp: Date.now(),
					},
				],
			};
		}

		return { type: 'none' };
	}

	/**
	 * Bundles a single MDX entrypoint with Fast Refresh support.
	 *
	 * @param entrypointPath - Absolute path to the source file
	 * @param outputUrl - URL path for the bundled file
	 * @returns True if bundling was successful
	 */
	private async bundleMdxEntrypoint(entrypointPath: string, outputUrl: string): Promise<boolean> {
		try {
			const srcDir = this.context.getSrcDir();
			const relativePath = path.relative(srcDir, entrypointPath);
			const relativePathJs = relativePath.replace(/\.mdx$/, '.js');
			const outputPath = path.join(this.context.getDistDir(), relativePathJs);

			const result = await Bun.build({
				entrypoints: [entrypointPath],
				outdir: this.context.getDistDir(),
				naming: relativePathJs,
				target: 'browser',
				format: 'esm',
				// @ts-expect-error: esbuild plugin type vs bun plugin type
				plugins: [mdx(this.compilerOptions), ...this.context.getPlugins()],
				minify: false,
				external: ['react', 'react-dom'],
			});

			if (!result.success) {
				return false;
			}

			const processed = await this.processOutput(outputPath, outputUrl);
			return processed;
		} catch {
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
	private async processOutput(filepath: string, _url: string): Promise<boolean> {
		try {
			let code = await Bun.file(filepath).text();

			if (code.includes('/* [ecopages] mdx-hmr */')) {
				return false;
			}

			code = this.replaceBareSpecifiers(code);
			code = this.injectReactFastRefresh(code);
			await Bun.write(filepath, code);

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Replaces bare specifiers with vendor URLs.
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
	 * @param code - The processed code
	 * @returns Code with React Fast Refresh boilerplate injected
	 */
	private injectReactFastRefresh(code: string): string {
		return `/* [ecopages] mdx-hmr */
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
