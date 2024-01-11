import { Glob } from "bun";
import { join } from "path";
import chokidar from "chokidar";
import { DIST_FOLDER } from "./eco.constants";
import fs from "node:fs";


if (!fs.existsSync(DIST_FOLDER)) {
  fs.mkdirSync(DIST_FOLDER);
}

const glob = new Glob("**/*.lit.ts");
const scannedFiles = glob.scanSync({ cwd: "." });
const litElements = Array.from(scannedFiles);

const scripts = [
  "src/scripts/dsd-polyfill.js",
  "src/scripts/hot-reload.ts",
  "src/scripts/lit-hydrate-support.ts",
  "src/scripts/is-land.ts",
];

const entrypoints = [...litElements, ...scripts].map((file) =>
  join(import.meta.dir, file)
);

async function buildApp() {
  const build = await Bun.build({
    entrypoints,
    outdir: "./public/js",
    target: "browser",
    minify: true,
  });

  build.logs.forEach((log) => console.log(log));

  const buildSuccesful = build.success;

  console.log(buildSuccesful ? "💫 Build succesful" : "🚨 Build failed");
}

await buildApp();

const watcher = chokidar.watch(entrypoints, {
  ignoreInitial: true,
});

watcher.on("all", async (event, path) => {
  console.log(`👀 File ${path} ${event}`);
  await buildApp();
});

process.on("SIGINT", async () => {
  await watcher.close();
  process.exit(0);
});
