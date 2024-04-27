import { beforeAll } from 'bun:test';
import { $ } from 'bun';

beforeAll(async () => {
  console.log('[eco-pages] Running build-all.ts...');
  process.chdir('packages/core/fixtures/app');
  await $`NODE_ENV="development" bun run ../../src/main/build-all.ts --build`;
});
