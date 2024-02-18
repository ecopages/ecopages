import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { gzipDirectory } from "root/lib/scripts/build/utils/gzip-directory";
import { generateRobotsTxt } from "root/lib/scripts/robots/generate-robots-txt";
import { buildScripts } from "root/lib/scripts/build/build-scripts";
import { buildPages } from "root/lib/scripts/build/build-pages";
import { buildInitialCss } from "root/lib/scripts/build/build-css";
import { getConfig } from "root/lib/scripts/config/get-config";
import { createWatcherSubscription } from "root/lib/scripts/build/watcher";
import { devServer } from "root/lib/dev/server";
import { $ } from "bun";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");
const projectDir = args.find((arg) => arg.startsWith("--config="))?.split("=")[1];

const config = await getConfig(projectDir);

if (!fs.existsSync(config.distDir)) {
  fs.mkdirSync(config.distDir);
} else {
  fs.rmSync(config.distDir, { recursive: true });
  fs.mkdirSync(config.distDir);
}

fs.cpSync(path.join(config.srcDir, config.publicDir), path.join(config.distDir, config.publicDir), {
  recursive: true,
});

generateRobotsTxt({
  preferences: config.robotsTxt.preferences,
  directory: config.distDir,
});

await buildInitialCss({ config });

await buildScripts({ config });

await buildPages({ config });

async function runDevServer(gzip: boolean = !WATCH_MODE) {
  const server = devServer({ config, gzip });
  await $`clear`;
  console.log(`[eco-pages] Server running at http://localhost:${server.port}`);
}

if (!WATCH_MODE) {
  exec(
    `bunx tailwindcss -i ${config.srcDir}/${config.globalDir}/css/tailwind.css -o ${config.distDir}/${config.globalDir}/css/tailwind.css --minify`
  );
  gzipDirectory(config.distDir);

  runDevServer();
} else {
  exec(
    `bunx tailwindcss -i ${config.srcDir}/${config.globalDir}/css/tailwind.css -o ${config.distDir}/${config.globalDir}/css/tailwind.css --watch --minify`
  );

  runDevServer();

  const subscription = await createWatcherSubscription({ config });

  process.on("SIGINT", async () => {
    await subscription.unsubscribe();
    process.exit(0);
  });
}
