/**
 * This module contains the Bun MDX Kitajs Loader
 * @module
 */

import mdx from '@mdx-js/esbuild';

/**
 * A bun plugin to process mdx files using mdx
 * Just add this plugin to your bunfig.toml file and it will process all .mdx files
 * It uses the @kitajs/html jsxImportSource
 * @example
 * ```toml
 * preload = ["@ecopages/bun-mdx-kitajs-loader"]
 * ```
 */
Bun.plugin(
  // @ts-expect-error: esbuild plugin vs bun plugin
  mdx({
    format: 'detect',
    outputFormat: 'program',
    jsxImportSource: '@kitajs/html',
  }),
);
