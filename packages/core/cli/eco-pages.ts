#!/usr/bin/env bun
import { $ } from "bun";

const args = process.argv.slice(2);

const projectDir = process.env.PWD;
const nodeModulesDir = `${projectDir}/node_modules`;

switch (args[0]) {
  case "dev":
    await $`bun run ${nodeModulesDir}/@eco-pages/core/src/scripts/build/build-all.ts --watch --config=${projectDir} --raw`;
    break;
  case "build":
    await $`bun run ${nodeModulesDir}/@eco-pages/core/src/scripts/build/build-all.ts`;
    break;
  case "preview":
    await $`bun run ${nodeModulesDir}/@eco-pages/core/src/scripts/build/build-all.ts --config=${projectDir}"`;
    break;
  default:
    console.log`"Command not found"`;
    process.exit(1);
}
