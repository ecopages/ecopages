import type { EcoPagesConfig } from "@types";
import { Glob } from "bun";

export class ScriptsBuilder {
  config: EcoPagesConfig;

  constructor(config: EcoPagesConfig) {
    this.config = config;
  }

  async build() {
    const { srcDir, distDir, scriptDescriptor, watchMode } = this.config;
    const glob = new Glob(`${srcDir}/**/*.${scriptDescriptor}.{ts,tsx}`);
    const scannedFiles = glob.scanSync({ cwd: "." });
    const scripts = Array.from(scannedFiles);

    const build = await Bun.build({
      entrypoints: scripts,
      outdir: distDir,
      root: srcDir,
      target: "browser",
      minify: !watchMode, // true, !watchMode,
      format: "esm",
      splitting: true,
    });

    if (!build.success) build.logs.forEach((log) => console.log(log));
  }
}
