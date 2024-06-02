#!/usr/bin/env bun
import { $ } from 'bun';

const args = process.argv.slice(2);

const projectDir = import.meta.env.PWD;

const nodeModulesDir = import.meta.dir;

switch (args[0]) {
  case 'dev':
    await $`NODE_ENV=development bun run ${nodeModulesDir}/src/main/build-all.ts --watch --config=${projectDir}`;
    break;
  case 'build':
    await $`bun run ${nodeModulesDir}/src/main/build-all.ts --build --config=${projectDir}`;
    break;
  case 'preview':
    await $`bun run ${nodeModulesDir}/src/main/build-all.ts --config=${projectDir}`;
    break;
  case 'start':
    await $`bun run ${nodeModulesDir}/src/main/build-all.ts --serve --config=${projectDir}`;
    break;
  default:
    console.log('[ecopages] Command not found');
}
