import type { EcoPagesConfig } from "root/lib/eco-pages.types";
import { buildHtmlPages } from "root/lib/plugin/build-html-pages/build-html-pages.plugin";
import { Glob } from "bun";

/**
 * @function buildPages
 * @description
 * Build the pages based on the eco config.
 * It will scan the src directory for pages and build them using the buildHtmlPages plugin.
 */
export async function buildPages() {
  const { ecoConfig: config } = globalThis;

  const glob = new Glob(`${config.srcDir}/${config.pagesDir}/**/*.tsx`);
  const scannedFiles = glob.scanSync({ cwd: "." });
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
