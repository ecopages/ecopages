import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BunPlugin } from 'bun';

type BunPostCssPluginOptions = {
  filter?: RegExp;
  namespace?: string;
  transform?: (contents: string | Buffer, args: { path: string; [key: string]: any }) => Promise<string> | string;
};

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
 * A bun plugin to process css files using postcss
 * @param options - The plugin options
 * @param options.filter - The filter to apply to the plugin
 * @param options.namespace - The namespace to apply to the plugin
 * @param options.transform - The transform function to apply to the plugin
 * @default options.filter - /\.css$/
 * @default options.namespace - 'bun-inline-css-plugin-namespace'
 * @default options.transform - async (contents: string | Buffer) => contents
 * @returns The bun plugin
 */
export const bunInlineCssPlugin = (options: BunPostCssPluginOptions): BunPlugin => {
  const { filter, namespace, transform } = Object.assign(
    {
      filter: /\.css$/,
      namespace: 'bun-inline-css-plugin',
      transform: async (contents: string | Buffer) => contents,
    },
    options,
  );

  return {
    name: 'bun-inline-css-plugin',
    setup(build) {
      build.onResolve({ filter }, (args) => {
        const absoluteImporter = path.resolve(args.importer);
        const importerDir = path.dirname(absoluteImporter);
        const absolutePath = `${path.join(importerDir, args.path)}`;

        return {
          path: absolutePath,
          namespace,
        };
      });

      build.onLoad({ filter: /.*/, namespace }, async (args) => {
        const buffer = getFileAsBuffer(args.path);

        return {
          contents: transform ? await transform(buffer, args) : buffer,
          loader: 'text',
        };
      });
    },
  };
};
