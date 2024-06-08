import { watch } from 'node:fs';
import path from 'node:path';
import { FileUtils } from '@/utils/file-utils.module';
import esbuild from 'esbuild';
import pkg from './package.json';
import { appLogger } from './src';

async function buildLib() {
  const filters = ['.d.ts', '.test.ts'];
  const files = await FileUtils.glob('src/**/*.ts');
  const entryPoints = files.filter((file) => !filters.some((filter) => file.endsWith(filter)));

  const build = await esbuild.build({
    entryPoints,
    outdir: 'dist',
    format: 'esm',
    bundle: true,
    splitting: true,
    platform: 'node',
    packages: 'external',
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
