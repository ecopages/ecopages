import { beforeAll } from 'bun:test';
import path from 'node:path';
import { buildApp } from '@/main/build-app';
import { appLogger } from '@/utils/app-logger';

function changeDirectory(targetDir: string) {
  try {
    const absolutePath = path.resolve(targetDir);
    process.chdir(absolutePath);
  } catch (error) {
    appLogger.error(`Error changing directory: ${error}`);
  }
}

beforeAll(async () => {
  appLogger.info('Preparing text fixtures for build tests.');
  changeDirectory('packages/core/fixtures/app');
  await buildApp({ config: process.cwd(), watch: false, serve: false, build: true });
});
