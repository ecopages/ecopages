import { Glob } from "bun";
import { join } from "path";
import fs from "node:fs";
import chokidar from "chokidar";
import { PUBLIC_FOLDER, DIST_DIR_PUBLIC, DIST_DIR } from "./eco.constants";
import { gzipDirectory } from "./tasks/gzip-dist";
import { generateRobotsTxt } from "./tasks/generate-robots-txt";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR);
} else {
  fs.rmSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR);
}

generateRobotsTxt({
  preferences: {
    "*": [],
    Googlebot: ["/public/assets/images/"],
  },
  directory: DIST_DIR,
});

/**
 * Scripts Builder
 */

const glob = new Glob("src/**/*.script.ts");
const scannedFiles = glob.scanSync({ cwd: "." });
const scripts = Array.from(scannedFiles);

async function buildScripts() {
  const build = await Bun.build({
    entrypoints: scripts,
    outdir: DIST_DIR,
    target: "browser",
    minify: true,
  });

  build.logs.forEach((log) => console.log(log));

  const buildSuccesful = build.success;

  gzipDirectory(DIST_DIR);

  console.log(buildSuccesful ? "💫 Build succesful" : "🚨 Build failed");
}

await buildScripts();

/**
 * Static Pages Builder
 */

const TEMPLATES_TO_WATCH = ["./src/components/**/*", "./src/layouts/**/*", "./src/pages/**/*"];

export async function createBuildStatic({ baseUrl }: { baseUrl: string }) {
  fs.cpSync(PUBLIC_FOLDER, DIST_DIR_PUBLIC, { recursive: true });

  const { generateRoutes } = await import("./eco.routes");

  const routesToRender = await generateRoutes();

  for (const route of routesToRender) {
    const path = route.path === "/" ? "index.html" : `${route.path}.html`;
    const docType = "<!DOCTYPE html>";
    await Bun.write(`${DIST_DIR}/${path}`, docType + route.html.toString());
  }
}

function cleanImportCache() {
  Object.keys(require.cache)
    .filter((id) => !id.includes("/node_modules/"))
    .forEach(function (id) {
      if (/.(kita|styles|script)/.test(id)) {
        delete require.cache[id];
      }
    });
}

await createBuildStatic({
  baseUrl: "http://localhost:" + (import.meta.env.PORT || 3000),
});

/**
 * Watchers
 */

if (!WATCH_MODE) {
  process.exit(0);
} else {
  const scriptsWatcher = chokidar.watch(scripts, {
    ignoreInitial: true,
  });

  scriptsWatcher.on("all", async () => {
    await buildScripts();
  });

  const templatesWatcher = chokidar.watch(TEMPLATES_TO_WATCH, {
    persistent: true,
    ignoreInitial: true,
  });

  templatesWatcher.on("all", async () => {
    cleanImportCache();
    await createBuildStatic({
      baseUrl: "http://localhost:" + (import.meta.env.PORT || 3000),
    });
  });

  process.on("SIGINT", async () => {
    await scriptsWatcher.close();
    await templatesWatcher.close();
    process.exit(0);
  });
}
