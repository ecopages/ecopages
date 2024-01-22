import { DIST_DIR_NAME } from "root/lib/global/constants";
import { exec } from "child_process";
import watcher from "@parcel/watcher";
import { buildCssFromPath } from "./build-css";
import { buildPages } from "./build-pages";
import { buildScripts } from "./build-scripts";

exec(
  "bunx tailwindcss -i src/global/css/tailwind.css -o dist/global/css/tailwind.css --watch --minify"
);

function cssEventWatcher(event: watcher.Event) {
  if (!event.path.endsWith(".css")) return;
  if (event.type === "create" || event.type === "update") {
    console.log(event, event.path);
    buildCssFromPath(event.path);
  } else if (event.type === "delete") {
    console.log(event.path.replace("src", DIST_DIR_NAME));
  }
}

const subscription = await watcher.subscribe("src", (err, events) => {
  events.forEach(async (event) => {
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
