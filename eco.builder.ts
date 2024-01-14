import { Glob } from "bun";
import { join } from "path";
import fs from "node:fs";
import chokidar from "chokidar";
import { PUBLIC_FOLDER, DIST_FOLDER_PUBLIC, DIST_FOLDER, DIST_FOLDER_JS } from "./eco.constants";
import { gzipDirectory } from "./tasks/gzip-dist";
import { generateRobotsTxt } from "./tasks/generate-robots-txt";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");

if (!fs.existsSync(DIST_FOLDER)) {
  fs.mkdirSync(DIST_FOLDER);
} else {
  fs.rmSync(DIST_FOLDER, { recursive: true });
  fs.mkdirSync(DIST_FOLDER);
}

generateRobotsTxt({
  preferences: {
    "*": [],
    Googlebot: ["/public/assets/images/"],
  },
  directory: DIST_FOLDER,
});

/**
 * Scripts Builder
 */

const glob = new Glob("src/**/*.script.ts");
const scannedFiles = glob.scanSync({ cwd: "." });
const scripts = Array.from(scannedFiles);

const entrypoints = scripts.map((file) => join(import.meta.dir, file));

async function buildScripts() {
  const build = await Bun.build({
    entrypoints,
    outdir: DIST_FOLDER_JS,
    target: "browser",
    minify: true,
  });

  build.logs.forEach((log) => console.log(log));

  const buildSuccesful = build.success;

  gzipDirectory(DIST_FOLDER_JS);

  console.log(buildSuccesful ? "💫 Build succesful" : "🚨 Build failed");
}

await buildScripts();

/**
 * Static Pages Builder
 */

const TEMPLATES_TO_WATCH = ["./src/components/**/*", "./src/includes/**/*", "./src/pages/**/*"];

export async function createBuildStatic({ baseUrl }: { baseUrl: string }) {
  fs.cpSync(PUBLIC_FOLDER, DIST_FOLDER_PUBLIC, { recursive: true });

  const { makeRoutes } = await import("./eco.config");

  const routesToRender = await makeRoutes({ baseUrl });

  for (const route of routesToRender) {
    const path = route.path === "/" ? "index.html" : `${route.path}.html`;
    const docType = "<!DOCTYPE html>";
    await Bun.write(`${DIST_FOLDER}/${path}`, docType + route.html.toString());
  }
}

function cleanImportCache() {
  Object.keys(require.cache)
    .filter((id) => !id.includes("/node_modules/"))
    .forEach(function (id) {
      if (/.(page|layout|controller|template)/.test(id)) {
        delete require.cache[id];
      }
    });
}

await createBuildStatic({
  baseUrl: "http://localhost:" + (process.env.PORT || 3000),
});

/**
 * Watchers
 */

if (!WATCH_MODE) {
  process.exit(0);
} else {
  const scriptsWatcher = chokidar.watch(entrypoints, {
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
      baseUrl: "http://localhost:" + (process.env.PORT || 3000),
    });
  });

  process.on("SIGINT", async () => {
    await templatesWatcher.close();
    process.exit(0);
  });
}
