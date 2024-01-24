import fs from "node:fs";
import { DIST_DIR } from "root/lib/global/constants";
import { gzipDirectory } from "root/lib/scripts/build/utils/gzip-directory";
import { generateRobotsTxt } from "root/lib/scripts/pages/generate-robots-txt";
import { buildScripts } from "root/lib/scripts/build/build-scripts";
import { buildPages } from "root/lib/scripts/build/build-pages";
import { buildInitialCss } from "./build-css";
import { exec } from "node:child_process";
import { $ } from "bun";
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

await buildInitialCss();

await buildScripts();

await buildPages({
  baseUrl: "http://localhost:" + (import.meta.env.PORT || 3000),
});

if (!WATCH_MODE) {
  exec("bunx tailwindcss -i src/global/css/tailwind.css -o dist/global/css/tailwind.css --minify");
  gzipDirectory(DIST_DIR);
} else {
  await $`bun run lib/scripts/build/watch-dev.ts`;
}
