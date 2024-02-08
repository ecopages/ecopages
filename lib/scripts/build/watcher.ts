import fs from "node:fs";
import watcher from "@parcel/watcher";
import type { EcoPagesConfig } from "root/lib/eco-pages.types";
import { buildCssFromPath } from "./build-css";
import { buildPages } from "./build-pages";
import { buildScripts } from "./build-scripts";

export async function createWatcherSubscription({ config }: { config: EcoPagesConfig }) {
  return watcher.subscribe("src", (err, events) => {
    if (err) {
      console.error("Error watching files", err);
      return;
    }

    events.forEach(async (event) => {
      if (event.type === "delete") {
        if (!event.path.includes(".") && event.path.includes(config.pagesDir)) {
          fs.rmSync(event.path.replace(config.pagesDir, config.distDir), {
            recursive: true,
          });
        } else {
          const pathToDelete = event.path.includes(config.pagesDir)
            ? event.path.replace(config.pagesDir, config.distDir).split(".")[0] + ".html"
            : event.path.replace(config.srcDir, config.distDir);

          fs.rmSync(pathToDelete);
        }
        return;
      }

      if (event.path.endsWith(".css")) {
        buildCssFromPath({ path: event.path, config });
      } else if (event.path.endsWith(".script.ts")) {
        buildScripts({ config });
      } else if (event.path.endsWith(".tsx")) {
        buildPages({ config });
      }
    });
  });
}
