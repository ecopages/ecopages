import { appLogger } from '@/global/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import esbuild from 'esbuild';

const filters = ['.d.ts', '.test.ts'];
const files = FileUtils.glob(['src/**/*.ts']);
const entryPoints = files.filter((file) => !filters.some((filter) => file.endsWith(filter)));

const WATCH_MODE = process.argv.includes('--dev-mode');

const plugins: esbuild.Plugin[] = [
  {
    name: 'ecopages-on-end-plugin',
    setup(build) {
      build.onEnd(() => {
        appLogger.info('Has been compiled correctly');
      });
    },
  },
];

const options: esbuild.BuildOptions = {
  entryPoints,
  outdir: 'dist',
  format: 'esm',
  bundle: true,
  splitting: true,
  platform: 'node',
  packages: 'external',
  external: ['bun'],
};

try {
  if (WATCH_MODE) {
    const context = await esbuild.context({ ...options, plugins });
    appLogger.info('Starting watcher');
    context.watch();

    process.on('SIGINT', () => {
      appLogger.info('Stopping watcher');
      context.dispose();
      process.exit(0);
    });
  } else {
    const build = await esbuild.build(options);
    if (build.errors.length) {
      for (const error of build.errors) {
        appLogger.error(error);
      }

      process.exit(1);
    }
  }
} catch (error) {
  appLogger.error(error);
  process.exit(1);
}
