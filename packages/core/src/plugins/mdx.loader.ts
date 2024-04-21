import { appLogger } from '@/utils/app-logger';
import mdx from '@mdx-js/esbuild';
import { plugin } from 'bun';

appLogger.debug('Setting up mdx-loader');
plugin(
  // @ts-expect-error: esbuild plugin vs bun plugin
  mdx({
    format: 'detect',
    outputFormat: 'program',
    jsxImportSource: '@kitajs/html',
  }),
);
