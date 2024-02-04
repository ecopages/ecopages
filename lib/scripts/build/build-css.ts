import fs from "fs";
import { Glob } from "bun";
import { postcssProcessor } from "../css/postcss-processor";
import type { EcoPagesConfig } from "root/lib/eco-pages.types";

export async function buildCssFromPath({
  path,
  config,
}: {
  path: string;
  config: Required<EcoPagesConfig>;
}) {
  const content = await postcssProcessor(path);

  const outputFileName = path.replace(config.rootDir, config.distDir);
  const directory = outputFileName.split("/").slice(0, -1).join("/");

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(outputFileName, content);
}

export async function buildInitialCss({ config }: { config: EcoPagesConfig }) {
  const glob = new Glob(
    `${config.rootDir}/{${config.componentsDir},${config.pagesDir},${config.globalDir},${config.layoutsDir}}/**/*.css`
  );
  const scannedFiles = glob.scanSync({ cwd: "." });
  const cssFiles = Array.from(scannedFiles);
  for (const path of cssFiles) {
    await buildCssFromPath({ path, config });
  }
}
