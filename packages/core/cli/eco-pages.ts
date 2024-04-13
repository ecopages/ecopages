#!/usr/bin/env bun
import { $ } from "bun";

const args = process.argv.slice(2);

const projectDir = import.meta.env.PWD;

const nodeModulesDir = import.meta.env._.replace("/.bin/eco-pages", "");

switch (args[0]) {
  case "dev":
    await $`NODE_ENV="development" bun run ${nodeModulesDir}/@eco-pages/core/src/build/build-all.ts --watch --config=${projectDir}`;
    break;
  case "build":
    await $`bun run ${nodeModulesDir}/@eco-pages/core/src/build/build-all.ts`;
    break;
  case "preview":
    await $`bun run ${nodeModulesDir}/@eco-pages/core/src/build/build-all.ts --config=${projectDir}"`;
    break;
  case "start":
    await $`bun run ${nodeModulesDir}/@eco-pages/core/src/build/build-all.ts --serve --config=${projectDir}"`;
    break;
  default:
    console.log`"Command not found"`;
    process.exit(1);
}
