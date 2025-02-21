/**
 * This module contains the PostCSS Processor
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { Logger } from '@ecopages/logger';
import postcss from 'postcss';
import { type PluginsRecord, defaultPlugins } from './default-plugins.ts';

/**
 * PostCSS Processor Options
 */
export type PostCssProcessorOptions = {
  plugins: postcss.AcceptedPlugin[];
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

const appLogger = new Logger('[@ecopages/postcss-processor]');

function getFileAsBuffer(path: string): Buffer {
  try {
    if (!existsSync(path)) {
      throw new Error(`File: ${path} not found`);
    }
    return readFileSync(path);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
  }
}

const getPlugins = (options?: PostCssProcessorOptions): postcss.AcceptedPlugin[] => {
  return options ? Object.values(options.plugins) : Object.values(defaultPlugins);
};

/**
 * It processes the given path using PostCSS
 * @param path string
 * @param options {@link PostCssProcessorOptions}
 * @returns string
 *
 * @example
 * ```ts
 * PostCssProcessor.processPath('path/to/file.css').then((processedCss) => {
 * console.log(processedCss);
 * });
 */
const processPath: ProcessPath = async (path, options) => {
  const contents = getFileAsBuffer(path);

  return postcss(getPlugins(options))
    .process(contents, { from: path })
    .then((result) => result.css)
    .catch((error) => {
      appLogger.error('Error processing file with PostCssProcessor', error.message);
      return '';
    });
};

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
const processStringOrBuffer: ProcessStringOrBuffer = async (contents, options) => {
  if (!contents) return '';

  return postcss(getPlugins(options))
    .process(contents, { from: undefined })
    .then((result) => result.css)
    .catch((error) => {
      appLogger.error('Error processing string or buffer with PostCssProcessor', error.message);
      return '';
    });
};

/**
 * PostCSS Processor
 * - {@link processPath} : It processes the given path using PostCSS
 * - {@link processStringOrBuffer}: It processes the given string or buffer using PostCSS
 * - {@link PluginsRecord}: Default plugins used by the PostCSS Processor
 */
export const PostCssProcessor: {
  processPath: ProcessPath;
  processStringOrBuffer: ProcessStringOrBuffer;
  defaultPlugins: PluginsRecord;
} = {
  processPath,
  processStringOrBuffer,
  defaultPlugins,
};
