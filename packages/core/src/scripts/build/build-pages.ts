import { buildHtmlPages } from "@/plugins/build-html-pages/build-html-pages.plugin";
import { Glob } from "bun";
import path from "node:path";

/**
 * @deprecated
 * @function buildPages
 * @description
 * Build the pages based on the eco config.
 * It will scan the src directory for pages and build them using the buildHtmlPages plugin.
 */
export async function buildPages() {
  const { ecoConfig: config } = globalThis;

  const dirPath = path.join(config.srcDir, config.pagesDir);
  const pattern = `${dirPath}/**/*.tsx`;

  const glob = new Glob(pattern);
  const scannedFiles = glob.scanSync({ cwd: config.rootDir });
  const scripts = Array.from(scannedFiles);

  const build = await Bun.build({
    entrypoints: scripts,
    outdir: config.distDir,
    target: "browser",
    root: config.srcDir,
    minify: true,
    plugins: [buildHtmlPages()],
    external: [...config.externalDeps],
  });

  if (!build.success) build.logs.forEach((log) => console.log(log));
}
