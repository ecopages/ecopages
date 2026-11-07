/**
 * This module contains the PostCSS Processor
 * @module
 */

import { fileSystem } from '@ecopages/file-system';
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
 * ProcessPath
 * @param path string
 * @param options {@link PostCssProcessorOptions}
 * @returns string
 */
export type ProcessPath = (path: string, options?: PostCssProcessorOptions) => Promise<string>;

/**
 * ProcessStringOrBuffer
 * @param contents string | Buffer
 * @param options {@link PostCssProcessorOptions}
 * @returns string
 */
export type ProcessStringOrBuffer = (contents: string | Buffer, options?: PostCssProcessorOptions) => Promise<string>;

export function getFileAsBuffer(path: string): Buffer {
	try {
		if (!fileSystem.exists(path)) {
			throw new Error(`File: ${path} not found`);
		}
		return fileSystem.readFileAsBuffer(path);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
	}
}

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
 * It processes the given path using PostCSS
 * @param path string
 * @param options {@link PostCssProcessorOptions}
 * @returns string
 *
 * @remarks
 * A PostCSS failure rejects. A `CssSyntaxError` names the file, line and column in its message.
 *
 * @example
 * ```ts
 * PostCssProcessor.processPath('path/to/file.css').then((processedCss) => {
 *  console.log(processedCss);
 * });\n */
const processPath: ProcessPath = async (path, options) => {
	const contents = getFileAsBuffer(path);

	return postcss(getPlugins(options))
		.process(contents, { from: path })
		.then((result) => {
			logWarnings(result, contents, path);
			return result.css;
		});
};

/** The CSS PostCSS produced and the files its plugins read, such as the partials `postcss-import` inlined. */
export type PostCssTransformResult = { css: string; dependencies: string[] };

/**
 * Runs PostCSS over `contents` and returns the CSS with the files the plugins reported reading.
 *
 * @remarks
 * The dependencies are the `file` of each `dependency` message, which `postcss-import` sends for every stylesheet it
 * inlines, whatever the form of the `@import` (a `layer()`, a media query, an unquoted `url()` or an alias).
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
		message.type === 'dependency' && typeof message.file === 'string' ? [message.file] : [],
	);
	return { css, dependencies: [...new Set(dependencies)] };
}

/**
 * It processes the given string or buffer using PostCSS
 * @param contents string | Buffer
 * @param options {@link PostCssProcessorOptions}
 * @returns string
 *
 * @example
 * ```ts
 * const css = `body { @apply bg-blue-500; }`;
 *
 * PostCssProcessor.processString(css).then((processedCss) => {
 * console.log(processedCss);
 * });
 * ```
 */
const processStringOrBuffer: ProcessStringOrBuffer = async (contents, options) =>
	(await transformWithPostcss(contents, options)).css;

export type ProcessStringOrBufferSync = (contents: string | Buffer, options?: PostCssProcessorOptions) => string;

const processStringOrBufferSync: ProcessStringOrBufferSync = (contents, options) => {
	if (!contents) return '';

	const result = postcss(getPlugins(options)).process(contents, { from: options?.filePath });
	logWarnings(result, contents, options?.filePath);
	let css = result.css;
	if (options?.transformOutput) {
		const output = options.transformOutput(css);
		if (output instanceof Promise) {
			throw new Error('transformOutput must be synchronous when used with processStringOrBufferSync');
		}
		css = output;
	}
	return css;
};

/**
 * PostCSS Processor
 * - {@link processPath} : It processes the given path using PostCSS
 * - {@link processStringOrBuffer}: It processes the given string or buffer using PostCSS
 * - {@link processStringOrBufferSync}: It processes the given string or buffer synchronously using PostCSS (requires all plugins to be sync)
 */
export const PostCssProcessor: {
	processPath: ProcessPath;
	processStringOrBuffer: ProcessStringOrBuffer;
	processStringOrBufferSync: ProcessStringOrBufferSync;
} = {
	processPath,
	processStringOrBuffer,
	processStringOrBufferSync,
};
