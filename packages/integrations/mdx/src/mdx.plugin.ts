import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import type { EcoPagesElement } from '@ecopages/core';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { deepMerge } from '@ecopages/core/utils/deep-merge';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin } from './mdx-loader-plugin.ts';
import { createMDXRenderer, MDXRenderer } from './mdx-renderer.ts';

const appLogger = new Logger('[MDXPlugin]');

/**
 * The name of the MDX plugin
 */
export const PLUGIN_NAME = 'MDX';

export type MDXPluginConfig = Partial<Omit<IntegrationPluginConfig, 'name'>> & {
	compilerOptions?: CompileOptions;
};

const defaultOptions: CompileOptions = {
	format: 'detect',
	outputFormat: 'program',
	jsxImportSource: '@kitajs/html',
	jsxRuntime: 'automatic',
	development: process.env.NODE_ENV === 'development',
};

/**
 * The MDX plugin class
 * This plugin provides support for MDX components in Ecopages.
 *
 * Standalone `mdxPlugin()` is intended for non-React JSX runtimes such as
 * `@kitajs/html`. React-backed MDX should be configured through
 * `reactPlugin({ mdx: { enabled: true, compilerOptions: ... } })` instead.
 */
export class MDXPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer: typeof MDXRenderer;
	private compilerOptions: CompileOptions;
	private mdxLoaderPlugin: EcoBuildPlugin | undefined;

	constructor({ compilerOptions, ...options }: MDXPluginConfig = { extensions: ['.mdx'] }) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.mdx'],
			...options,
		});

		const finalCompilerOptions = deepMerge({ ...defaultOptions }, compilerOptions);
		const jsxImportSource = finalCompilerOptions.jsxImportSource;

		if (jsxImportSource === 'react' || (jsxImportSource?.startsWith('react/') ?? false)) {
			throw new Error(
				'Standalone `mdxPlugin()` does not support React JSX runtimes. Use `reactPlugin({ mdx: { enabled: true, compilerOptions: ... } })` instead.',
			);
		}

		this.compilerOptions = finalCompilerOptions;
		this.renderer = createMDXRenderer(finalCompilerOptions);

		appLogger.debug(`MDX plugin configured with jsxImportSource: ${jsxImportSource ?? 'default'}`);
	}

	override get plugins(): EcoBuildPlugin[] {
		if (this.mdxLoaderPlugin) {
			return [this.mdxLoaderPlugin];
		}

		return [];
	}

	override async setup(): Promise<void> {
		this.mdxLoaderPlugin = createMdxLoaderPlugin(this.compilerOptions);
		await super.setup();
	}
}

/**
 * Factory function to create an MDX plugin instance.
 * @param options Configuration options for the MDX plugin
 * @returns A new MDXPlugin instance
 */
export function mdxPlugin(options?: MDXPluginConfig): MDXPlugin {
	return new MDXPlugin(options);
}
