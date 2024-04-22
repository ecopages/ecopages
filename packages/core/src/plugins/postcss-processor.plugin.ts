import path from 'node:path';
import { FileUtils } from '@/utils/file-utils.module';
import type { BunPlugin } from 'bun';

type InlineImportOptions = {
  filter?: RegExp;
  namespace?: string;
  transform?: (contents: string, args: { path: string; [key: string]: any }) => Promise<string> | string;
};

export const postCssProcessorPlugin = (options: InlineImportOptions): BunPlugin => {
  const { filter, namespace, transform } = Object.assign(
    {
      filter: /\.css$/,
      namespace: 'postcss-processor-plugin',
      transform: async (contents: string) => contents,
    },
    options,
  );

  return {
    name: 'postcss-processor-plugin',
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
        let contents = await (await FileUtils.get(args.path)).text();

        if (typeof transform === 'function') {
          contents = await transform(contents, args);
        }

        return {
          contents,
          loader: 'text',
        };
      });
    },
  };
};
