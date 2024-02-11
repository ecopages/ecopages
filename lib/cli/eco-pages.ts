#!/usr/bin/env bun
import { $ } from "bun";

const args = process.argv.slice(2);

const projectDir = import.meta.env.PWD;

switch (args[0]) {
  case "dev":
    await $`bun run lib/scripts/build/build-all.ts --watch --config=${projectDir} --raw`;
    break;
  case "build":
    await $`bun run lib/scripts/build/build-all.ts`;
    break;
  case "preview":
    await $`bun run lib/scripts/build/build-all.ts --config=${projectDir}"`;
    await $`wds --config lib/web-dev-server/config.mjs --open`;
    break;
  default:
    console.log`"Command not found"`;
    process.exit(1);
}
