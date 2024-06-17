import { watch } from 'node:fs';
import { appLogger } from '@/shared';
import esbuild from 'esbuild';
import pkg from './package.json';

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
