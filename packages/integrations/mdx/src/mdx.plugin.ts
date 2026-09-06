import type { EcoPagesElement } from '@ecopages/core';
import {
	IntegrationPlugin,
	mergeIntegrationOptions,
	type EcoBuildPlugin,
} from '@ecopages/core/plugins/integration-plugin';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin } from './mdx-loader-plugin.ts';
import { MDX_PLUGIN_NAME } from './mdx.constants.ts';
import { MDXRenderer } from './mdx-renderer.ts';
import type { MDXPluginConfig } from './mdx.types.ts';
import type { JsxImportSource } from './core/jsx-import-source.ts';

export type {
	MDXPluginConfig,
	MDXRendererConfig,
	MDXRendererOptions,
	StandaloneMdxCompilerOptions,
} from './mdx.types.ts';
export type { JsxImportSource, KnownJsxImportSource, ThirdPartyJsxImportSource } from './core/jsx-import-source.ts';

const appLogger = new Logger('[MDXPlugin]');

/**
 * The name of the MDX plugin
 */
export const PLUGIN_NAME = MDX_PLUGIN_NAME;

const defaultOptions: CompileOptions = {
	format: 'detect',
	outputFormat: 'program',
	jsxRuntime: 'automatic',
	development: process.env.NODE_ENV === 'development',
};

function assertStandaloneJsxImportSource(
	jsxImportSource: string | null | undefined,
): asserts jsxImportSource is JsxImportSource {
	if (!jsxImportSource) {
		throw new Error(
			'Standalone `mdxPlugin()` requires `compilerOptions.jsxImportSource` (for example `@kitajs/html`). React-backed MDX should use `reactPlugin({ mdx: { enabled: true } })`; Ecopages JSX MDX should use `ecopagesJsxPlugin({ mdx: { enabled: true } })`.',
		);
	}

	if (jsxImportSource === 'react' || jsxImportSource.startsWith('react/')) {
		throw new Error(
			'Standalone `mdxPlugin()` does not support React JSX runtimes. Use `reactPlugin({ mdx: { enabled: true, compilerOptions: ... } })` instead.',
		);
	}

	if (jsxImportSource === '@ecopages/jsx' || jsxImportSource.startsWith('@ecopages/jsx/')) {
		throw new Error(
			'Standalone `mdxPlugin()` does not support the Ecopages JSX runtime. Use `ecopagesJsxPlugin({ mdx: { enabled: true, compilerOptions: ... } })` instead.',
		);
	}
}

/**
 * Splits configured markdown extensions into the two buckets understood by the
 * MDX loader.
 *
 * `.mdx` remains the native MDX extension list. `.md` is special: it is only
 * treated as MDX when a caller explicitly opts it into the pipeline, so we keep
 * it separate rather than hiding that behavior inside a pair of constructor
 * filters.
 */
function splitMarkdownExtensions(extensions: string[]): Pick<CompileOptions, 'mdExtensions' | 'mdxExtensions'> {
	const mdExtensions: string[] = [];
	const mdxExtensions: string[] = [];

	for (const extension of extensions) {
		if (extension === '.md') {
			mdExtensions.push(extension);
			continue;
		}

		mdxExtensions.push(extension);
	}

	return { mdExtensions, mdxExtensions };
}

/**
 * The MDX plugin class
 * This plugin provides support for MDX components in Ecopages.
 *
 * Standalone `mdxPlugin()` is for third-party JSX runtimes. Set
 * `compilerOptions.jsxImportSource` explicitly (for example `@kitajs/html`).
 * React-backed MDX should be configured through
 * `reactPlugin({ mdx: { enabled: true, compilerOptions: ... } })`.
 * Ecopages JSX MDX should use `ecopagesJsxPlugin({ mdx: { enabled: true } })`.
 */
export class MDXPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer = MDXRenderer;
	private readonly compilerOptions: CompileOptions;
	private mdxLoaderPlugin: EcoBuildPlugin | undefined;

	constructor({ compilerOptions, ...options }: MDXPluginConfig) {
		super({
			name: PLUGIN_NAME,
			...options,
			extensions: options.extensions ?? ['.mdx'],
		});

		const { mdExtensions, mdxExtensions } = splitMarkdownExtensions(this.extensions);

		const finalCompilerOptions = mergeIntegrationOptions(
			{
				...defaultOptions,
				mdxExtensions,
				mdExtensions,
			},
			compilerOptions ?? {},
		);
		const jsxImportSource = finalCompilerOptions.jsxImportSource;

		assertStandaloneJsxImportSource(jsxImportSource);

		this.compilerOptions = finalCompilerOptions;

		appLogger.debug(`MDX plugin configured with jsxImportSource: ${jsxImportSource}`);
	}

	override initializeRenderer(options?: { rendererModules?: unknown }): MDXRenderer {
		const renderer = new this.renderer({
			...this.createRendererOptions(options),
			mdxConfig: {
				compilerOptions: this.compilerOptions,
			},
		});
		return this.attachRendererRuntimeServices(renderer);
	}

	override get plugins(): EcoBuildPlugin[] {
		if (this.mdxLoaderPlugin) {
			return [this.mdxLoaderPlugin];
		}

		return [];
	}

	/**
	 * Materializes the MDX loader once so config-time sealing and runtime setup
	 * can share the same loader instance.
	 */
	private ensureLoaderPlugin(): void {
		if (this.mdxLoaderPlugin) {
			return;
		}

		if (!this.appConfig?.rootDir) {
			throw new Error('[MDXPlugin] Cannot create MDX loader: appConfig.rootDir is required.');
		}

		this.mdxLoaderPlugin = createMdxLoaderPlugin({
			compilerOptions: this.compilerOptions,
			projectRoot: this.appConfig.rootDir,
		});
	}

	/**
	 * Prepares the MDX loader contribution before config build seals the manifest.
	 */
	override async prepareBuildContributions(): Promise<void> {
		this.ensureLoaderPlugin();
	}

	/**
	 * Runs runtime-only MDX setup after build contributions are already prepared.
	 */
	override async setup(): Promise<void> {
		this.ensureLoaderPlugin();
		await super.setup();
	}
}

/**
 * Factory function to create an MDX plugin instance.
 * @param options Configuration options for the MDX plugin
 * @returns A new MDXPlugin instance
 */
export function mdxPlugin(options: MDXPluginConfig): MDXPlugin {
	return new MDXPlugin(options);
}
