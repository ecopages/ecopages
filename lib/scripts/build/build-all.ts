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

fs.cpSync(
  path.join(config.rootDir, config.publicDir),
  path.join(config.distDir, config.publicDir),
  { recursive: true }
);

generateRobotsTxt({
  preferences: config.robotsTxt.preferences,
  directory: config.distDir,
});

await buildInitialCss({ config });

await buildScripts({ config });

await buildPages({ config });

if (!WATCH_MODE) {
  exec(
    `bunx tailwindcss -i ${config.rootDir}/${config.globalDir}/css/tailwind.css -o ${config.distDir}/${config.globalDir}/css/tailwind.css --minify`
  );
  gzipDirectory(config.distDir);
} else {
  exec(
    `bunx tailwindcss -i ${config.rootDir}/${config.globalDir}/css/tailwind.css -o ${config.distDir}/${config.globalDir}/css/tailwind.css --watch --minify`
  );

  const subscription = await createWatcherSubscription({ config });

  process.on("SIGINT", async () => {
    await subscription.unsubscribe();
    process.exit(0);
  });
}
