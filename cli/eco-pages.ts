#!/usr/bin/env bun
import { $ } from "bun";

const args = process.argv.slice(2);

switch (args[0]) {
  case "dev":
    await $`concurrently "bun run lib/scripts/build/build-all.ts --watch" "wds --config lib/web-dev-server/config.mjs --watch" --raw`;
    break;
  case "build":
    await $`bun run lib/scripts/build/build-all.ts`;
    break;
  case "preview":
    await $`bun run lib/scripts/build/build-all.ts"`;
    await $`wds --config lib/web-dev-server/config.mjs --open`;
    break;
  default:
    console.log`"Command not found"`;
    process.exit(1);
}

// import { exec } from "child_process";
// import { promisify } from "util";

// const asyncExec = promisify(exec);

// const args = process.argv.slice(2);

// const baseScripts = {
//   "build-all": "bun run lib/scripts/build/build-all.ts",
//   "watch:build": "bun run lib/scripts/build/build-all.ts --watch",
//   "watch:wds": "wds --config lib/web-dev-server/config.mjs --watch",
//   "serve:wds": "wds --config lib/web-dev-server/config.mjs --open",
// };

// const commandTypes = {
//   series: "series",
//   concurrently: "concurrently",
// } as const;

// type CommandType = (typeof commandTypes)[keyof typeof commandTypes];

// const commands = {
//   dev: {
//     type: commandTypes.concurrently,
//     commands: [baseScripts["watch:build"], baseScripts["watch:wds"]],
//   },
//   build: {
//     type: commandTypes.series,
//     commands: [baseScripts["build-all"]],
//   },
//   preview: {
//     type: commandTypes.series,
//     commands: [baseScripts["build-all"], baseScripts["serve:wds"]],
//   },
// };

// type Commands = keyof typeof commands;

// const command = args[0] as Commands;

// function getCommand(command: Commands) {
//   return commands[command];
// }

// function buildCommand(type: CommandType, commands: string[]) {
//   switch (type) {
//     case commandTypes.concurrently:
//       return `concurrently ${commands.map((c) => `"${c}"`).join(" ")}`;
//     case commandTypes.series:
//       return commands.join(" && ");
//   }
// }

// const commandToRun = getCommand(command);

// if (!commandToRun) {
//   console.log("Command not found");
//   process.exit(1);
// }

// const commandString = buildCommand(commandToRun.type, commandToRun.commands);

// async function runCommand(command: string) {
//   const { stdout, stderr } = await asyncExec(command);

//   console.log(stdout);
//   console.error(stderr);
// }

// await runCommand(commandString);
