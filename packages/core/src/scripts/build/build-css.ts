import fs from "fs";
import { Glob } from "bun";
import { postcssProcessor } from "../css/postcss-processor";

/**
 * @function buildCssFromPath
 * @description
 * Build the css files based on the path.
 * It will process the css file and write it to the dist directory.
 * @param path
 */
export async function buildCssFromPath({ path }: { path: string }) {
  const { ecoConfig: config } = globalThis;
  const content = await postcssProcessor(path);

  const outputFileName = path.replace(config.srcDir, config.distDir);
  const directory = outputFileName.split("/").slice(0, -1).join("/");

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(outputFileName, content);
}

/**
 * @function buildInitialCss
 * @description
 * Build the initial css files based on the eco config.
 * It will scan the src directory for css files and build them.
 */
export async function buildInitialCss() {
  const { ecoConfig: config } = globalThis;
  const glob = new Glob(`${config.srcDir}/**/*.css`);
  const scannedFiles = glob.scanSync({ cwd: "." });
  const cssFiles = Array.from(scannedFiles);
  for (const path of cssFiles) {
    await buildCssFromPath({ path });
  }
}
