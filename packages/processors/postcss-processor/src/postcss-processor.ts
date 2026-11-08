/**
 * This module contains the PostCSS Processor
 * @module
 */

import { warnStylesheetOnce } from '@ecopages/core/processor';
import { path, type PathApi } from '@ecopages/file-system/path';
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
 * Plugins whose `dependency` and `dir-dependency` messages name the content they scanned for class names, not files
 * the CSS inlined.
 *
 * @remarks
 * Tailwind reports every file it scanned, stylesheets included. Counting them as dependencies would make each scanned
 * stylesheet look like a partial of the Tailwind entry, so they are kept apart as {@link ContentSources}.
 */
const CONTENT_SCANNING_PLUGINS = new Set(['tailwindcss', '@tailwindcss/postcss']);

/** What a content scanning plugin read to generate a stylesheet: the files it scanned and the directories it watches. */
export type ContentSources = {
	files: string[];
	directories: { dir: string; glob: string }[];
};

/** The CSS PostCSS produced, the files its plugins inlined, and the content a scanning plugin read. */
export type PostCssTransformResult = { css: string; dependencies: string[]; contentSources: ContentSources };

/**
 * Runs PostCSS over `contents` and returns the CSS with the files the plugins reported reading.
 *
 * @remarks
 * The dependencies are the `file` of each `dependency` message, which `postcss-import` sends for every stylesheet it
 * inlines, whatever the form of the `@import` (a `layer()`, a media query, an unquoted `url()` or an alias). The
 * messages of {@link CONTENT_SCANNING_PLUGINS} are in `contentSources`.
 */
export async function transformWithPostcss(
	contents: string | Buffer,
	options?: PostCssProcessorOptions,
): Promise<PostCssTransformResult> {
	if (!contents) return { css: '', dependencies: [], contentSources: { files: [], directories: [] } };

	const result = await postcss(getPlugins(options)).process(contents, { from: options?.filePath });
	logWarnings(result, contents, options?.filePath);
	const css = options?.transformOutput ? await options.transformOutput(result.css) : result.css;
	return {
		css,
		dependencies: collectDependencies(result.messages),
		contentSources: collectContentSources(result.messages),
	};
}

/**
 * The files the plugins reported reading, with forward slashes.
 *
 * @remarks
 * PostCSS plugins report paths in the host's native form, backslashes on Windows, while every path in core uses
 * forward slashes. `pathApi` is a parameter so a test can run the Windows form on any host.
 */
export function collectDependencies(messages: postcss.Message[], pathApi: PathApi = path): string[] {
	const dependencies = messages.flatMap((message) =>
		message.type === 'dependency' &&
		typeof message.file === 'string' &&
		!CONTENT_SCANNING_PLUGINS.has(String(message.plugin))
			? [pathApi.fromNative(message.file)]
			: [],
	);
	return [...new Set(dependencies)];
}

/**
 * The files and directories a content scanning plugin reported, with forward slashes.
 *
 * @remarks
 * A `dir-dependency` message names a directory and the glob of the files in it that count. A `dependency` message
 * names one file the plugin scanned.
 */
export function collectContentSources(messages: postcss.Message[], pathApi: PathApi = path): ContentSources {
	const files = new Set<string>();
	const directories = new Map<string, { dir: string; glob: string }>();
	for (const message of messages) {
		if (!CONTENT_SCANNING_PLUGINS.has(String(message.plugin))) continue;
		if (message.type === 'dependency' && typeof message.file === 'string') {
			files.add(pathApi.fromNative(message.file));
		} else if (message.type === 'dir-dependency' && typeof message.dir === 'string') {
			const dir = pathApi.fromNative(message.dir);
			const glob = typeof message.glob === 'string' ? message.glob : '**/*';
			directories.set(`${dir}\0${glob}`, { dir, glob });
		}
	}
	return { files: [...files], directories: [...directories.values()] };
}

/** Whether `file` is one of the `sources`: a scanned file, or a file under a watched directory that its glob matches. */
export function matchesContentSources(sources: ContentSources, file: string, pathApi: PathApi = path): boolean {
	return (
		sources.files.includes(file) ||
		sources.directories.some(
			({ dir, glob }) => pathApi.isWithin(dir, file) && pathApi.matchesGlob(pathApi.relative(dir, file), glob),
		)
	);
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
