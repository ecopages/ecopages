import { existsSync, readFileSync } from 'node:fs';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import type { BunPlugin } from 'bun';

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

export type BunPostCssLoaderOptions = {
  name?: string;
  inputHeader?: string;
};

export function bunPostCssLoader(options: BunPostCssLoaderOptions = {}): BunPlugin {
  const { inputHeader, name = 'bun-plugin-postcss-loader' } = options;
  return {
    name,
    setup(build) {
      const postcssFilter = /\.css/;

      build.onLoad({ filter: postcssFilter }, async (args) => {
        let text = getFileAsBuffer(args.path).toString();

        if (inputHeader) {
          text = `${inputHeader}\n${text}`;
        }

        const contents = await PostCssProcessor.processStringOrBuffer(text);
        return {
          contents,
          exports: { default: contents },
          loader: 'object',
        };
      });
    },
  };
}
