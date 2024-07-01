import mdx from '@mdx-js/esbuild';

Bun.plugin(
  // @ts-expect-error: esbuild plugin vs bun plugin
  mdx({
    format: 'detect',
    outputFormat: 'program',
    jsxImportSource: '@kitajs/html',
  }),
);
