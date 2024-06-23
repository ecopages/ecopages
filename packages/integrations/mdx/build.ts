import { Logger } from '@ecopages/logger';
import esbuild from 'esbuild';
import pkg from './package.json';

const logger = new Logger(`[${pkg.name}]`);

const WATCH_MODE = process.argv.includes('--dev-mode');

const plugins: esbuild.Plugin[] = [
  {
    name: 'ecopages-on-end-plugin',
    setup(build) {
      build.onEnd(() => {
        logger.info('Has been compiled correctly');
      });
    },
  },
];

const options: esbuild.BuildOptions = {
  entryPoints: ['./src/index.ts'],
  outdir: 'dist',
  format: 'esm',
  minify: true,
  splitting: true,
  bundle: true,
  platform: 'node',
  external: [...Object.keys(pkg.peerDependencies)],
};

try {
  if (WATCH_MODE) {
    const context = await esbuild.context({ ...options, plugins });
    logger.info('Starting watcher');
    context.watch();

    process.on('SIGINT', () => {
      logger.info('Stopping watcher');
      context.dispose();
      process.exit(0);
    });
  } else {
    const build = await esbuild.build(options);
    if (build.errors.length) {
      for (const error of build.errors) {
        logger.error(error);
      }

      process.exit(1);
    }
  }
} catch (error) {
  logger.error(error);
  process.exit(1);
}
