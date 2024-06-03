import { FileUtils } from '@/utils/file-utils.module';
import { appLogger } from './src';

const filters = ['.d.ts', '.test.ts'];
const files = await FileUtils.glob('src/**/*.ts');
const entry = files.filter((file) => !filters.some((filter) => file.endsWith(filter)));

const build = await Bun.build({
  entrypoints: entry,
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
