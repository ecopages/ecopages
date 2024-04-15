import type { EcoPagesConfig } from "@types";
import { Glob } from "bun";

type ScriptsBuilderOptions = {
  watchMode: boolean;
};
export class ScriptsBuilder {
  config: EcoPagesConfig;
  options: ScriptsBuilderOptions;

  constructor({ config, options }: { config: EcoPagesConfig; options: { watchMode: boolean } }) {
    this.config = config;
    this.options = options;
  }

  async build() {
    const { srcDir, distDir, scriptDescriptor } = this.config;
    const glob = new Glob(`${srcDir}/**/*.${scriptDescriptor}.{ts,tsx}`);
    const scannedFiles = glob.scanSync({ cwd: "." });
    const scripts = Array.from(scannedFiles);

    const build = await Bun.build({
      entrypoints: scripts,
      outdir: distDir,
      root: srcDir,
      target: "browser",
      minify: !this.options.watchMode,
      format: "esm",
      splitting: true,
    });

    if (!build.success) build.logs.forEach((log) => console.log(log));
  }
}
