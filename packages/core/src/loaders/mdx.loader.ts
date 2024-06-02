import mdx from '@mdx-js/esbuild';
import { plugin } from 'bun';

plugin(
  // @ts-expect-error: esbuild plugin vs bun plugin
  mdx({
    format: 'detect',
    outputFormat: 'program',
    jsxImportSource: '@kitajs/html',
  }),
);
