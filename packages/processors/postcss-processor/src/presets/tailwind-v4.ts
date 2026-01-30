/**
 * Tailwind CSS v4 Preset for PostCSS Processor
 * @module @ecopages/postcss-processor/presets/tailwind-v4
 *
 * Requires: @tailwindcss/postcss, cssnano
 * Install: bun add @tailwindcss/postcss cssnano
 */

import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import browserslist from 'browserslist';
import cssnano from 'cssnano';
import path from 'node:path';
import postcssImport from 'postcss-import';
import postcssNested from 'postcss-nested';
import type { PostCssProcessorPluginConfig } from '../plugin.ts';

/**
 * Options for Tailwind v4 preset
 */
export interface TailwindV4PresetOptions {
	/**
	 * Absolute path to the main Tailwind CSS file containing `@import "tailwindcss"`.
	 * Used to calculate relative @reference paths for CSS files using @apply.
	 */
	referencePath: string;
}

/**
 * Creates a PostCSS processor config preset for Tailwind CSS v4.
 *
 * Features:
 * - Uses `@tailwindcss/postcss` plugin (v4)
 * - Automatically injects `@reference` headers for `@apply` support
 * - Includes cssnano for CSS minification
 *
 * @example
 * ```typescript
 * import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
 * import { tailwindV4Preset } from '@ecopages/postcss-processor/presets';
 *
 * // Basic usage
 * postcssProcessorPlugin(tailwindV4Preset({
 *   referencePath: path.resolve(import.meta.dir, 'src/styles/tailwind.css'),
 * }))
 *
 * // Extend with additional plugins
 * const preset = tailwindV4Preset({ referencePath });
 * postcssProcessorPlugin({
 *   ...preset,
 *   plugins: { ...preset.plugins, myPlugin: myPlugin() },
 * })
 * ```
 */
export function tailwindV4Preset(options: TailwindV4PresetOptions): PostCssProcessorPluginConfig {
	const { referencePath } = options;

	// Check if browserslist config exists
	const browserslistConfig = browserslist.loadConfig({ path: process.cwd() });
	const autoprefixerOptions = browserslistConfig
		? {}
		: {
				overrideBrowserslist: ['>0.3%', 'not ie 11', 'not dead', 'not op_mini all'],
			};

	return {
		plugins: {
			'postcss-import': postcssImport(),
			'postcss-nested': postcssNested(),
			'@tailwindcss/postcss': tailwindcss(),
			autoprefixer: autoprefixer(autoprefixerOptions),
			cssnano: cssnano(),
		},
		transformInput: async (contents: string | Buffer, filePath: string): Promise<string> => {
			const css = contents instanceof Buffer ? contents.toString('utf-8') : (contents as string);
			const normalizedFilePath = path.resolve(filePath);
			const normalizedReferencePath = path.resolve(referencePath);

			/** Skip transformation for the main tailwind entry file */
			if (normalizedFilePath === normalizedReferencePath) {
				return css;
			}

			/** Skip if file already has an @reference directive */
			if (/^\s*@reference\s+/m.test(css)) {
				return css;
			}

			const relativePath = path.relative(path.dirname(filePath), referencePath);

			/** Skip if file already imports the referencePath */
			if (css.includes(`@import '${relativePath}'`) || css.includes(`@import "${relativePath}"`)) {
				return css;
			}

			/**
			 * Replace `@import 'tailwindcss'` with an import to the referencePath.
			 * This ensures custom theme variables are available for @apply directives.
			 */
			const tailwindImportPattern = /^@import\s+['"]tailwindcss(?:\/[^'"]*)?['"];?\s*$/m;
			if (tailwindImportPattern.test(css)) {
				return css.replace(tailwindImportPattern, `@import '${relativePath}';`);
			}

			/** If file uses @apply but has no tailwind import, add @reference */
			if (css.includes('@apply')) {
				return `@reference "${relativePath}";\n\n${css}`;
			}

			return css;
		},
	};
}
