import { appLogger } from '@ecopages/core';

const build = await Bun.build({
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  root: 'src',
  target: 'bun',
  format: 'esm',
  minify: true,
  splitting: true,
});

if (!build.success) {
  for (const log of build.logs) {
    appLogger.debug(log);
  }
}
