import fs from "node:fs";
import watcher from "@parcel/watcher";
import { buildCssFromPath } from "./build-css";
import { buildScripts } from "./build-scripts";

/**
 * @function createWatcherSubscription
 * @description
 * This function creates a watcher subscription to watch for file changes.
 */
export async function createWatcherSubscription() {
  return watcher.subscribe("src", (err, events) => {
    if (err) {
      console.error("Error watching files", err);
      return;
    }

    const { ecoConfig: config } = globalThis;

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

          if (fs.existsSync(pathToDelete)) {
            fs.rmSync(pathToDelete);
          }
        }
        return;
      }

      if (event.path.endsWith(".css")) {
        buildCssFromPath({ path: event.path });
        console.log("[eco-pages] File changed", event.path.split(config.srcDir)[1]);
      } else if (event.path.includes(`.${config.scriptDescriptor}.`)) {
        buildScripts();
        console.log("[eco-pages] File changed", event.path.split(config.srcDir)[1]);
      }
    });
  });
}
