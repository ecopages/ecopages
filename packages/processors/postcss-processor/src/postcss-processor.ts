/**
 * This module contains the PostCSS Processor
 * @module
 */

import { warnStylesheetOnce } from '@ecopages/core/processor';
import { Logger } from '@ecopages/logger';
import postcss from 'postcss';

/**
 * PostCSS Processor Options
 */
export type PostCssProcessorOptions = {
	plugins?: postcss.AcceptedPlugin[];
	/**
	 * Optional file path for resolving relative imports
	 */
	filePath?: string;
	/**
	 * Optional callback to transform the output CSS
	 * @param css The processed CSS
	 * @returns The transformed CSS
	 */
	transformOutput?: (css: string) => string | Promise<string>;
};

/**
 * ProcessStringOrBuffer
 * @param contents string | Buffer
 * @param options {@link PostCssProcessorOptions}
 * @returns string
 */
export type ProcessStringOrBuffer = (contents: string | Buffer, options?: PostCssProcessorOptions) => Promise<string>;

const appLogger = new Logger('[@ecopages/postcss-processor]');

/**
 * Logs the warnings PostCSS collected, each with its file, line and column.
 *
 * @remarks
 * A stylesheet is processed in several passes, so a warning is logged once per stylesheet and message until its
 * contents change (see `warnStylesheetOnce`).
 */
const logWarnings = (
	result: { warnings(): postcss.Warning[] },
	source: string | Buffer,
	file: string | undefined,
): void => {
	const contents = source.toString();
	for (const warning of result.warnings()) {
		warnStylesheetOnce(file ?? '', contents, warning.toString(), (message) => appLogger.warn(message));
	}
};

const getPlugins = (options?: PostCssProcessorOptions): postcss.AcceptedPlugin[] => {
	if (!options || !options.plugins) return [];
	return Array.isArray(options.plugins) ? options.plugins : Object.values(options.plugins);
};

/**
 * Plugins whose `dependency` messages name the content they scanned for class names, not files the CSS inlined.
 *
 * @remarks
 * Tailwind reports every file it scanned, stylesheets included. Counting them would make each scanned stylesheet look
 * like a partial of the Tailwind entry; a change to scanned content reaches the entry through `invalidateStylesheets`.
 */
const CONTENT_SCANNING_PLUGINS = new Set(['tailwindcss', '@tailwindcss/postcss']);

/** The CSS PostCSS produced and the files its plugins read, such as the partials `postcss-import` inlined. */
export type PostCssTransformResult = { css: string; dependencies: string[] };

/**
 * Runs PostCSS over `contents` and returns the CSS with the files the plugins reported reading.
 *
 * @remarks
 * The dependencies are the `file` of each `dependency` message, which `postcss-import` sends for every stylesheet it
 * inlines, whatever the form of the `@import` (a `layer()`, a media query, an unquoted `url()` or an alias). The
 * messages of {@link CONTENT_SCANNING_PLUGINS} are left out.
 */
export async function transformWithPostcss(
	contents: string | Buffer,
	options?: PostCssProcessorOptions,
): Promise<PostCssTransformResult> {
	if (!contents) return { css: '', dependencies: [] };

	const result = await postcss(getPlugins(options)).process(contents, { from: options?.filePath });
	logWarnings(result, contents, options?.filePath);
	const css = options?.transformOutput ? await options.transformOutput(result.css) : result.css;
	const dependencies = result.messages.flatMap((message) =>
		message.type === 'dependency' &&
		typeof message.file === 'string' &&
		!CONTENT_SCANNING_PLUGINS.has(String(message.plugin))
			? [message.file]
			: [],
	);
	return { css, dependencies: [...new Set(dependencies)] };
}

/**
 * It processes the given string or buffer using PostCSS
 * @param contents string | Buffer
 * @param options {@link PostCssProcessorOptions}
 * @returns the processed CSS
 *
 * @remarks
 * A PostCSS failure rejects. A `CssSyntaxError` names the file, line and column in its message.
 *
 * @example
 * ```ts
 * const css = `body { @apply bg-blue-500; }`;
 *
 * PostCssProcessor.processStringOrBuffer(css).then((processedCss) => {
 * console.log(processedCss);
 * });
 * ```
 */
const processStringOrBuffer: ProcessStringOrBuffer = async (contents, options) =>
	(await transformWithPostcss(contents, options)).css;

/**
 * PostCSS Processor
 * - {@link processStringOrBuffer}: It processes the given string or buffer using PostCSS
 */
export const PostCssProcessor: {
	processStringOrBuffer: ProcessStringOrBuffer;
} = {
	processStringOrBuffer,
};
