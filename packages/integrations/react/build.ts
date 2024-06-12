import { watch } from 'node:fs';
import { Logger } from '@ecopages/logger';
import esbuild from 'esbuild';
import pkg from './package.json';

const logger = new Logger('[@ecopages/react]');

async function buildLib() {
  const build = await esbuild.build({
    entryPoints: ['./src/index.ts'],
    outdir: 'dist',
    format: 'esm',
    minify: true,
    splitting: true,
    bundle: true,
    platform: 'node',
    external: [...Object.keys(pkg.peerDependencies)],
  });

  if (build.errors.length) {
    logger.error('Error building lib', build.errors);
  }
}

await buildLib();

if (process.argv.includes('--dev-mode')) {
  logger.info(`${pkg.name} Watching for changes`);
  const watcher = watch('src', { recursive: true }, (_event, filename) => {
    logger.info(`${pkg.name} File ${filename} changed`);
    buildLib();
  });
  process.on('SIGINT', () => {
    logger.info(`${pkg.name} Stopping watcher`);
    watcher.close();
    process.exit(0);
  });
}
