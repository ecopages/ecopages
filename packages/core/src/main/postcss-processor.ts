import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import type { CssProcessor } from '@types';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import postcss from 'postcss';
import postCssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import tailwindcssNesting from 'tailwindcss/nesting/index.js';

async function processPath(path: string) {
  const contents = await FileUtils.getPathAsString(path);

  const processor = postcss([postCssImport(), tailwindcssNesting, tailwindcss, autoprefixer, cssnano]);

  try {
    return await processor.process(contents, { from: path }).then((result) => result.css);
  } catch (error) {
    appLogger.error('postcss-processor > processPath | Error processing PostCSS', error);
    return '';
  }
}

async function processString(contents: string) {
  const processor = postcss([postCssImport(), tailwindcssNesting, tailwindcss, autoprefixer, cssnano]);
  try {
    return await processor.process(contents, { from: undefined }).then((result) => result.css);
  } catch (error) {
    appLogger.error('postcss-processor > processString | Error processing PostCSS', error);
    return '';
  }
}

export const PostCssProcessor: CssProcessor = {
  processPath,
  processString,
};
