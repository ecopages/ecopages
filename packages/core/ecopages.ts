#!/usr/bin/env bun
import { $ } from 'bun';

const args = process.argv.slice(2);

const projectDir = import.meta.env.PWD;

const currentDir = import.meta.dir;

switch (args[0]) {
  case 'watch:dev':
    await $`NODE_ENV=development bun --hot ${currentDir}/dist/main/build-all.js --watch --config=${projectDir}`;
    break;
  case 'dev':
    await $`NODE_ENV=development bun run ${currentDir}/dist/main/build-all.js --watch --config=${projectDir}`;
    break;
  case 'build':
    await $`bun run ${currentDir}/dist/main/build-all.js --build --config=${projectDir}`;
    break;
  case 'preview':
    await $`bun run ${currentDir}/dist/main/build-all.js --config=${projectDir}`;
    break;
  case 'start':
    await $`bun run ${currentDir}/dist/main/build-all.js --serve --config=${projectDir}`;
    break;
  default:
    console.log('[ecopages] Command not found');
}
