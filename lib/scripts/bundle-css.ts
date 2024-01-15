import fs from "fs";
import { Glob } from "bun";
import chokidar from "chokidar";
import postcss from "postcss";
import postCssImport from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";
import tailwindcss from "tailwindcss";
import tailwindcssNesting from "tailwindcss/nesting/index.js";
import { DIST_DIR_NAME } from "root/lib/global/constants";
import { executeScript } from "./execute-script";

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const WATCH_TAILWIND = args.includes("tailwindcss");

export const postcssMacro = async (path: string) => {
  const rootUrl = import.meta.dir.split("/").slice(0, -2).join("/");
  const fileUrl = `${rootUrl}/${path}`;
  const contents = await Bun.file(fileUrl).text();

  const processor = postcss([
    postCssImport(),
    tailwindcssNesting,
    tailwindcss,
    autoprefixer,
    cssnano,
  ]);

  return await processor.process(contents, { from: path }).then((result) => result.css);
};

const glob = new Glob("src/{components,pages,layouts}/**/*.css");
const TAILWIND_CSS = "src/global/css/tailwind.css";
const ALPINE_CSS = "src/global/css/alpine.css";

const scannedFiles = glob.scanSync({ cwd: "." });
const cssFiles = Array.from(scannedFiles).concat(TAILWIND_CSS).concat(ALPINE_CSS);

const buildCss = async (file: string) => {
  const content = await postcssMacro(file);

  const outputFileName = file.replace("src", DIST_DIR_NAME);
  const directory = outputFileName.split("/").slice(0, -1).join("/");

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(outputFileName, content);

  const compressedData = Bun.gzipSync(Buffer.from(content));
  const gzipFileName = `${outputFileName}.gz`;
  fs.writeFileSync(gzipFileName, compressedData);
};

for (const file of cssFiles) {
  await buildCss(file);
}

if (WATCH) {
  if (WATCH_TAILWIND) {
    executeScript(
      "bunx tailwindcss -i src/global/css/tailwind.css -o dist/global/css/tailwind.css --watch"
    );
  }
  const watchCss = chokidar.watch(cssFiles, {
    persistent: true,
    ignoreInitial: true,
  });

  watchCss.on("change", async (path) => {
    await buildCss(path);
  });

  process.on("SIGINT", async () => {
    await watchCss.close();
    process.exit(0);
  });
}
