/**
 * LightningCssProcessorPlugin
 * @module @ecopages/lightningcss-processor
 */

import {
	Processor,
	type ProcessorConfig,
	type StylesheetInvalidation,
	type StylesheetTransformResult,
} from '@ecopages/core/processor';
import { bundleStylesheet, packageScopeFile } from './bundle-stylesheet.ts';
import {
	logWarnings,
	resolveLightningCssOptions,
	serializeExports,
	toStylesheetError,
	transformSourceWithPlugins,
	type ResolvedLightningCssOptions,
	type LightningCssOptions,
} from './lightningcss-engine.ts';
import type { LightningCssPreprocessor } from './preprocessor.ts';

export type {
	LightningCssPreprocessor,
	LightningCssPreprocessorContext,
	PreprocessedStylesheet,
} from './preprocessor.ts';
export type {
	LightningCssFeature,
	LightningCssModulesOptions,
	LightningCssOptions,
	LightningCssPlugin,
} from './lightningcss-engine.ts';

/** Configuration for the Lightning CSS Processor. */
export interface LightningCssProcessorPluginConfig extends LightningCssOptions {
	/**
	 * Regex filter to match the stylesheets to process.
	 * @default /\.css$/
	 */
	filter?: RegExp;
	/**
	 * A stage that runs on every stylesheet before Lightning CSS, such as the Tailwind v4 preset.
	 *
	 * @remarks
	 * Presets set it; most apps never write one.
	 */
	preprocessor?: LightningCssPreprocessor;
}

/**
 * A stylesheet Processor that runs Lightning CSS: it lowers the CSS for the browsers in `targets` and minifies it.
 *
 * @remarks
 * An app has one stylesheet Processor, so this one replaces the PostCSS Processor instead of running after it. The
 * native binding loads on the first stylesheet, never while the config is finalized. A stylesheet Lightning CSS
 * rejects throws an error naming the file and the position, so a build fails and development keeps the last good
 * output until a save fixes it.
 */
export class LightningCssProcessorPlugin extends Processor<LightningCssProcessorPluginConfig> {
	static DEFAULT_OPTIONS: Required<Pick<LightningCssProcessorPluginConfig, 'filter'>> = {
		filter: /\.css$/,
	};

	private resolvedOptions?: Promise<ResolvedLightningCssOptions>;

	constructor(
		config: Omit<ProcessorConfig<LightningCssProcessorPluginConfig>, 'name'> = {
			options: LightningCssProcessorPlugin.DEFAULT_OPTIONS,
		},
	) {
		const filter = config.options?.filter ?? LightningCssProcessorPlugin.DEFAULT_OPTIONS.filter;
		super({
			name: 'ecopages-lightningcss-processor',
			...config,
			capabilities: [
				...(config.capabilities ?? []).filter((capability) => capability.kind !== 'stylesheet'),
				{
					kind: 'stylesheet',
					extensions: ['*.css'],
					filter,
					cssModules: true,
				},
			],
		});
	}

	/**
	 * @remarks
	 * Core's development stylesheet service prewarms and rebuilds the app's stylesheets, and the native binding loads
	 * on the first transform.
	 */
	async setup(): Promise<void> {}

	/**
	 * Names the stylesheets the preprocessor rebuilds for the changed files that are not stylesheets.
	 *
	 * @remarks
	 * Without a preprocessor nothing but a stylesheet's own `@import`s changes its output, and core rebuilds those from
	 * the transform's `dependencies`.
	 */
	override invalidateStylesheets(files: readonly string[]): StylesheetInvalidation | Promise<StylesheetInvalidation> {
		return this.options?.preprocessor?.invalidate?.(files) ?? [];
	}

	override async transformStylesheet(css: string, file: string): Promise<StylesheetTransformResult> {
		if (!this.context) {
			throw new Error('Context must be set');
		}
		this.resolvedOptions ??= resolveLightningCssOptions(this.options, this.context.rootDir).catch(
			(error: unknown) => {
				this.resolvedOptions = undefined;
				throw error;
			},
		);
		try {
			const options = await this.resolvedOptions;
			const hasSourcePlugin = options.plugins.some((plugin) => plugin.transformSource);
			const source = await transformSourceWithPlugins(css, file, options.plugins);
			const preprocessed = packageScopeFile(file, this.context.rootDir)
				? undefined
				: await this.options?.preprocessor?.transform(source, file, {
						rootDir: this.context.rootDir,
						...(hasSourcePlugin
							? {
									transformSource: (text, name) =>
										transformSourceWithPlugins(text, name, options.plugins),
								}
							: {}),
					});
			const bundled = await bundleStylesheet(preprocessed?.css ?? source, file, this.context.rootDir, options);
			logWarnings(bundled.warnings, file, css);
			const bundledCss = Buffer.from(bundled.code).toString();
			return {
				css: bundled.hoisted.length > 0 ? `${bundled.hoisted.join('\n')}\n${bundledCss}` : bundledCss,
				dependencies: [...new Set([...(preprocessed?.dependencies ?? []), ...bundled.dependencies])],
				...(bundled.exports ? { exports: serializeExports(bundled.exports) } : {}),
			};
		} catch (error) {
			throw toStylesheetError(error, file);
		}
	}
}

export const lightningCssProcessorPlugin = (
	config?: LightningCssProcessorPluginConfig,
): LightningCssProcessorPlugin => {
	return new LightningCssProcessorPlugin({
		options: config,
	});
};
