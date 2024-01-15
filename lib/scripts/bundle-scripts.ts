import { Glob } from "bun";
import fs from "node:fs";
import chokidar from "chokidar";
import { DIST_DIR } from "root/lib/global/constants";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR);
} else {
  fs.rmSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR);
}

const glob = new Glob("src/**/*.script.ts");
const scannedFiles = glob.scanSync({ cwd: "." });
const scripts = Array.from(scannedFiles);

export async function buildScripts() {
  const build = await Bun.build({
    entrypoints: scripts,
    outdir: DIST_DIR,
    target: "browser",
    minify: true,
  });

  build.logs.forEach((log) => console.log(log));

  const buildSuccesful = build.success;

  console.log(buildSuccesful ? "💫 Build succesful" : "🚨 Build failed");
}

if (WATCH_MODE) {
  const scriptsWatcher = chokidar.watch(scripts, {
    ignoreInitial: true,
  });

  scriptsWatcher.on("all", async () => {
    await buildScripts();
  });

  process.on("SIGINT", async () => {
    await scriptsWatcher.close();
    process.exit(0);
  });
}
