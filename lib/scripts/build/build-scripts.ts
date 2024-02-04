import { Glob } from "bun";
import type { EcoPagesConfig } from "root/lib/eco-pages.types";

export async function buildScripts({ config }: { config: EcoPagesConfig }) {
  const glob = new Glob(`${config.rootDir}/**/*.script.ts`);
  const scannedFiles = glob.scanSync({ cwd: "." });
  const scripts = Array.from(scannedFiles);

  const build = await Bun.build({
    entrypoints: scripts,
    outdir: config.distDir,
    target: "browser",
    root: config.rootDir,
    minify: true,
  });

  build.logs.forEach((log) => console.log(log));
}
