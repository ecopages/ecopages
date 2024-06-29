import { existsSync, readFileSync } from 'node:fs';
import { PostCssProcessor } from '@ecopages/postcss-processor';

export function getFileAsBuffer(path: string): Buffer {
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

/**
 * A Bun plugin that processes PostCSS files
 * Just add this plugin to your bunfig.toml file and it will process all .css files
 * @example
 * ```toml
 * preload = ["@ecopages/bun-postcss-loader"]
 * ```
 */
Bun.plugin({
  name: 'bun-postcss-loader',
  setup(build) {
    const postcssFilter = /\.css/;

    build.onLoad({ filter: postcssFilter }, async (args) => {
      const text = getFileAsBuffer(args.path);
      const contents = await PostCssProcessor.processStringOrBuffer(text);
      return {
        contents,
        exports: { default: contents },
        loader: 'object',
      };
    });
  },
});
