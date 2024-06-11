import { appLogger } from '@/global/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import type { CssProcessor } from '@types';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import postcss from 'postcss';
import postCssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import tailwindcssNesting from 'tailwindcss/nesting/index.js';

async function processPath(path: string) {
  const contents = FileUtils.getFileAsBuffer(path);

  const processor = postcss([postCssImport(), tailwindcssNesting, tailwindcss, autoprefixer, cssnano]);

  try {
    return await processor.process(contents, { from: path }).then((result) => result.css);
  } catch (error) {
    appLogger.error('postcss-processor > processPath | Error processing PostCSS', error);
    return '';
  }
}

async function processStringOrBuffer(contents: string | Buffer) {
  const processor = postcss([postCssImport(), tailwindcssNesting, tailwindcss, autoprefixer, cssnano]);
  try {
    return await processor.process(contents, { from: undefined }).then((result) => result.css);
  } catch (error) {
    appLogger.error('postcss-processor > processStringOrBuffer | Error processing PostCSS', error);
    return '';
  }
}

export const PostCssProcessor: CssProcessor = {
  processPath,
  processString: processStringOrBuffer,
};
