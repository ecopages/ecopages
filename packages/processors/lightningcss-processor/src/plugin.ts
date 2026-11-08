/**
 * LightningCssProcessorPlugin
 * @module @ecopages/lightningcss-processor
 */

import { Processor, type ProcessorConfig, type StylesheetTransformResult } from '@ecopages/core/processor';
import { bundleStylesheet } from './bundle-stylesheet.ts';
import {
	logWarnings,
	resolveLightningCssOptions,
	toStylesheetError,
	type ResolvedLightningCssOptions,
	type LightningCssOptions,
} from './lightningcss-engine.ts';

export type { LightningCssFeature, LightningCssOptions } from './lightningcss-engine.ts';

/** Configuration for the Lightning CSS Processor. */
export interface LightningCssProcessorPluginConfig extends LightningCssOptions {
	/**
	 * Regex filter to match the stylesheets to process.
	 * @default /\.css$/
	 */
	filter?: RegExp;
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
			const bundled = await bundleStylesheet(css, file, this.context.rootDir, await this.resolvedOptions);
			logWarnings(bundled.warnings, file, css);
			const bundledCss = Buffer.from(bundled.code).toString();
			return {
				css: bundled.hoisted.length > 0 ? `${bundled.hoisted.join('\n')}\n${bundledCss}` : bundledCss,
				dependencies: bundled.dependencies,
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
