import fs from "fs";
import { Glob } from "bun";
import { DIST_DIR_NAME } from "root/lib/global/constants";
import { postcssProcessor } from "./postcss-processor";

const glob = new Glob("src/{components,pages,layouts}/**/*.css");
const TAILWIND_CSS = "src/global/css/tailwind.css";
const ALPINE_CSS = "src/global/css/alpine.css";

const scannedFiles = glob.scanSync({ cwd: "." });
const cssFiles = Array.from(scannedFiles).concat(TAILWIND_CSS).concat(ALPINE_CSS);

export async function buildCss(file: string) {
  const content = await postcssProcessor(file);

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
