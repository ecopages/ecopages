import fs from "node:fs";
import chokidar from "chokidar";
import {
  PUBLIC_FOLDER,
  DIST_PUBLIC_FOLDER,
  RELOAD_COMMAND,
} from "./eco.constants";

const WATCHED_FILES = [
  "./src/components/**/*",
  "./src/includes/**/*",
  "./src/pages/**/*",
];

function getPagesIndex() {
  const pagesIndex = fs
    .readdirSync("./src/pages")
    .filter((file) => !file.endsWith(".css"));

  return pagesIndex;
}

export async function createBuildStatic({ baseUrl }: { baseUrl: string }) {
  fs.cpSync(PUBLIC_FOLDER, DIST_PUBLIC_FOLDER, { recursive: true });

  const { makeRoutes } = await import("./eco.config");

  const routesToRender = await makeRoutes({ baseUrl });

  for (const route of routesToRender) {
    const path = route.path === "/" ? "index.html" : `${route.path}.html`;
    await Bun.write(`./dist/${path}`, route.html.toString());
  }
}

const watcher = chokidar.watch(WATCHED_FILES, {
  persistent: true,
  ignoreInitial: true,
});

function cleanImportCache() {
  Object.keys(require.cache)
    .filter((id) => !id.includes("/node_modules/"))
    .forEach(function (id) {
      if (/.(page|layout|lit)/.test(id)) {
        delete require.cache[id];
      }
    });
}

await createBuildStatic({
  baseUrl: "http://localhost:" + (process.env.PORT || 3000),
});

export const startWatcher = async ({
  ws,
  baseUrl,
}: {
  ws: any;
  baseUrl: string;
}) => {
  watcher.removeAllListeners();

  watcher.on("all", async (event, path) => {
    cleanImportCache();
    await createBuildStatic({ baseUrl });
    ws.send(RELOAD_COMMAND);
  });
};

// await createBuildStatic({
//   baseUrl: "http://localhost:" + (process.env.PORT || 3000),
// });

// watcher.on("all", async (event, path) => {
//   cleanImportCache();
//   await createBuildStatic({
//     baseUrl: "http://localhost:" + (process.env.PORT || 3000),
//   });
// });

process.on("SIGINT", async () => {
  await watcher.close();
  process.exit(1);
});
