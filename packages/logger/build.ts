import esbuild from 'esbuild';
import { Logger } from './src/logger';

const appLogger = new Logger('[@ecopages/logger]');

async function buildLib() {
  const build = await esbuild.build({
    entryPoints: ['./src/index.ts'],
    outdir: 'dist',
    format: 'esm',
    minify: true,
    splitting: true,
    bundle: true,
    platform: 'node',
  });

  if (build.errors.length) {
    appLogger.error('Error building lib', build.errors);
  }
}

await buildLib();
