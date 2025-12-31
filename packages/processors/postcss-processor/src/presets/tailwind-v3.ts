/**
 * Tailwind CSS v3 Preset for PostCSS Processor
 * @module @ecopages/postcss-processor/presets/tailwind-v3
 *
 * Requires: tailwindcss, postcss-import, autoprefixer, cssnano
 * Install: bun add tailwindcss postcss-import autoprefixer cssnano
 */

import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import type postcss from 'postcss';
import postcssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import tailwindcssNesting from 'tailwindcss/nesting/index.js';
import type { PostCssProcessorPluginConfig } from '../plugin';

type PluginsRecord = Record<string, postcss.AcceptedPlugin>;

/**
 * Creates a PostCSS processor config preset for Tailwind CSS v3.
 *
 * Features:
 * - Uses classic Tailwind v3 plugin stack
 * - Includes postcss-import, tailwindcss/nesting, tailwindcss, autoprefixer, cssnano
 *
 * @example
 * ```typescript
 * import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
 * import { tailwindV3Preset } from '@ecopages/postcss-processor/presets';
 *
 * // Basic usage
 * postcssProcessorPlugin(tailwindV3Preset())
 *
 * // Extend with additional plugins
 * const preset = tailwindV3Preset();
 * postcssProcessorPlugin({
 *   ...preset,
 *   plugins: { ...preset.plugins, myPlugin: myPlugin() },
 * })
 * ```
 */
export function tailwindV3Preset(): PostCssProcessorPluginConfig {
	const plugins: PluginsRecord = {
		'postcss-import': postcssImport(),
		'tailwindcss/nesting': tailwindcssNesting,
		tailwindcss: tailwindcss,
		autoprefixer: autoprefixer,
		cssnano: cssnano(),
	};

	return { plugins };
}
