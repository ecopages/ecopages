import path from 'node:path';
import { FileUtils } from '@/utils/file-utils.module';
import type { BunPlugin } from 'bun';

type InlineImportOptions = {
  filter?: RegExp;
  namespace?: string;
  transform?: (contents: string | Buffer, args: { path: string; [key: string]: any }) => Promise<string> | string;
};

export const postCssProcessorPlugin = (options: InlineImportOptions): BunPlugin => {
  const { filter, namespace, transform } = Object.assign(
    {
      filter: /\.css$/,
      namespace: 'postcss-processor-plugin',
      transform: async (contents: string | Buffer) => contents,
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
        const buffer = FileUtils.getFileAsBuffer(args.path);

        return {
          contents: transform ? await transform(buffer, args) : buffer,
          loader: 'text',
        };
      });
    },
  };
};
