import { DIST_DIR_NAME } from "root/lib/global/constants";
import { exec } from "child_process";
import watcher from "@parcel/watcher";
import { buildCssFromPath } from "./build-css";
import { buildPages } from "./build-pages";
import { buildScripts } from "./build-scripts";
import { cleanImportCache } from "./utils/clean-import-cache";
import fs from "node:fs";

exec(
  "bunx tailwindcss -i src/global/css/tailwind.css -o dist/global/css/tailwind.css --watch --minify"
);

function cssEventWatcher(event: watcher.Event) {
  if (!event.path.endsWith(".css")) return;
  if (event.type === "create" || event.type === "update") {
    buildCssFromPath(event.path);
  } else if (event.type === "delete") {
    const cssFilePath = event.path.replace("src", DIST_DIR_NAME);
    fs.rmSync(cssFilePath);
  }
}

const subscription = await watcher.subscribe("src", (err, events) => {
  events.forEach(async (event) => {
    cleanImportCache();
    if (event.path.endsWith(".css")) {
      cssEventWatcher(event);
    } else if (event.path.endsWith(".script.ts")) {
      buildScripts();
    } else if (event.path.endsWith(".tsx")) {
      buildPages({
        baseUrl: "http://localhost:" + (import.meta.env.PORT || 3000),
      });
    }
  });
});

process.on("SIGINT", async () => {
  await subscription.unsubscribe();
  process.exit(0);
});
