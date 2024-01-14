import fs from 'fs';
import { Glob } from "bun";
import { join } from "path";
import chokidar from "chokidar";
import postcss from "postcss";
import postCssImport from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";
import tailwindcss from "tailwindcss";
import tailwindcssNesting from "tailwindcss/nesting/index.js";
import { DIST_FOLDER_CSS } from 'root/eco.constants';
import { gzipDirectory } from './gzip-dist';

// verify DIST_CSS_FOLDER exists,if not create
if (!fs.existsSync(DIST_FOLDER_CSS)) {
  fs.mkdirSync(DIST_FOLDER_CSS);
}

const args = process.argv.slice(2);
const watch = args.includes("--watch");

export const postcssMacro = async (path: string) => {
  const rootUrl = import.meta.dir.split("/").slice(0, -1).join("/");
  const fileUrl = `${rootUrl}/${path}`;
  const contents = await Bun.file(fileUrl).text();

  const processor = postcss([
    postCssImport(),
    tailwindcssNesting,
    tailwindcss,
    autoprefixer,
    cssnano,
  ]);

  return await processor
    .process(contents, { from: path })
    .then((result) => result.css);
};

const glob = new Glob('src/{components,pages,includes}/**/*.css');
const TAILWIND_CSS = "src/global/css/tailwind.css";
const ALPINE_CSS = "src/global/css/alpine.css";

const scannedFiles = glob.scanSync({ cwd: "." });
const cssFiles = Array.from(scannedFiles).concat(TAILWIND_CSS).concat(ALPINE_CSS);

const buildCss = async (file: string) => {
  const content = await postcssMacro(file);
  const fileName = file.split('/').pop();
  const outputFileName = `${DIST_FOLDER_CSS}/${fileName}`;
  fs.writeFileSync(join(process.cwd(), outputFileName), content);

  const compressedData = Bun.gzipSync(Buffer.from(content));
  const gzipFileName = `${outputFileName}.gz`;
  fs.writeFileSync(join(process.cwd(), gzipFileName), compressedData);
}

for (const file of cssFiles) {
  await buildCss(file)
}

if (watch) {
  const watcherBase = chokidar.watch(cssFiles, {
    persistent: true,
    ignoreInitial: true,
  });

  watcherBase.on("change", async (path) => {
    await buildCss(path);
  })

  process.on("SIGINT", async () => {
    await watcherBase.close();
    process.exit(0);
  });
}


