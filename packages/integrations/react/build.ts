import { watch } from 'node:fs';
import { appLogger } from '@ecopages/core';
import esbuild from 'esbuild';
import pkg from './package.json';

async function buildLib() {
  const filters = ['.d.ts', '.test.ts'];
  const glob = new Bun.Glob('src/**/*.ts');
  const files = await Array.fromAsync(glob.scan({ cwd: process.cwd() }));
  const entryPoints = files.filter((file) => !filters.some((filter) => file.endsWith(filter)));

  const build = await esbuild.build({
    entryPoints,
    outdir: 'dist',
    format: 'esm',
    minify: true,
    splitting: true,
    bundle: true,
    platform: 'node',
    external: ['bun'],
  });

  if (build.errors.length) {
    appLogger.error('Error building lib', build.errors);
  }
}

await buildLib();

if (process.argv.includes('--dev-mode')) {
  appLogger.info(`${pkg.name} Watching for changes`);
  const watcher = watch('src', { recursive: true }, (_event, filename) => {
    appLogger.info(`${pkg.name} File ${filename} changed`);
    buildLib();
  });
  process.on('SIGINT', () => {
    appLogger.info(`${pkg.name} Stopping watcher`);
    watcher.close();
    process.exit(0);
  });
}
