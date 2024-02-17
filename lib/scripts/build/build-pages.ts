import type { EcoPagesConfig } from "root/lib/eco-pages.types";
import { buildHtmlPages } from "root/lib/scripts/pages/build-html-pages.plugin";
import { Glob } from "bun";

export async function buildPages({ config }: { config: EcoPagesConfig }) {
  const glob = new Glob(`${config.srcDir}/${config.pagesDir}/**/*.tsx`);
  const scannedFiles = glob.scanSync({ cwd: "." });
  const scripts = Array.from(scannedFiles);

  const build = await Bun.build({
    entrypoints: scripts,
    outdir: config.distDir,
    target: "browser",
    root: config.srcDir,
    minify: true,
    plugins: [buildHtmlPages({ config })],
    external: [...config.externalDeps],
  });

  if (!build.success) build.logs.forEach((log) => console.log(log));
}
