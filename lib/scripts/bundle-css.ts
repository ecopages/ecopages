import fs from "fs";
import { Glob } from "bun";
import postcss from "postcss";
import postCssImport from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";
import tailwindcss from "tailwindcss";
import tailwindcssNesting from "tailwindcss/nesting/index.js";
import { DIST_DIR_NAME } from "root/lib/global/constants";

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");

export const postcssMacro = async (path: string) => {
  const contents = await Bun.file(path).text();

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

export async function buildCss(file: string) {
  const content = await postcssMacro(file);

  const outputFileName = file.replace("src", DIST_DIR_NAME);
  const directory = outputFileName.split("/").slice(0, -1).join("/");

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(outputFileName, content);
}

export async function buildInitialCss() {
  for (const file of cssFiles) {
    await buildCss(file);
  }
}
