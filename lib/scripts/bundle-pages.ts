import fs from "node:fs";
import chokidar from "chokidar";
import { PUBLIC_FOLDER, DIST_DIR_PUBLIC, DIST_DIR } from "root/lib/global/constants";
import { collectHtmlPages } from "root/lib/scripts/collect-html-pages";
import { cleanImportCache } from "./clean-import-cache";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");

const TEMPLATES_TO_WATCH = ["./src/components/**/*", "./src/layouts/**/*", "./src/pages/**/*"];

export async function createBuildStatic({ baseUrl }: { baseUrl: string }) {
  fs.cpSync(PUBLIC_FOLDER, DIST_DIR_PUBLIC, { recursive: true });

  const routesToRender = await collectHtmlPages();

  for (const route of routesToRender) {
    const path = route.path === "/" ? "index.html" : `${route.path}.html`;
    const docType = "<!DOCTYPE html>";
    await Bun.write(`${DIST_DIR}/${path}`, docType + route.html.toString());
  }
}

if (!WATCH_MODE) {
  process.exit(0);
} else {
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
    await templatesWatcher.close();
    process.exit(0);
  });
}
