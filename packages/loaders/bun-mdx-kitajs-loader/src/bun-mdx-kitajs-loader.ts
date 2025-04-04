import mdx, { type Options } from '@mdx-js/esbuild';
import type { BunPlugin } from 'bun';

/**
 * A bun plugin to process mdx files using mdx
 * Just add this plugin to your bunfig.toml file and it will process all .mdx files
 * It uses the @kitajs/html jsxImportSource
 * @example
 * ```toml
 * preload = ["@ecopages/bun-mdx-kitajs-loader"]
 * ```
 */

export function bunMdxLoader(
  options: Partial<Options> = {
    format: 'detect',
    outputFormat: 'program',
    jsxImportSource: '@kitajs/html',
  },
): BunPlugin {
  return mdx(options) as unknown as BunPlugin;
}
