import { Glob } from "bun";
import type { EcoPagesConfig } from "root/lib/eco-pages.types";

export async function buildScripts({
  config,
  watch = false,
}: {
  config: EcoPagesConfig;
  watch?: boolean;
}) {
  const glob = new Glob(`${config.srcDir}/**/*.{script.ts,lib.ts}`);
  const scannedFiles = glob.scanSync({ cwd: "." });
  const scripts = Array.from(scannedFiles);

  const build = await Bun.build({
    entrypoints: scripts,
    outdir: config.distDir,
    root: config.srcDir,
    target: "browser",
    minify: !watch,
    format: "esm",
    splitting: true,
  });
}
