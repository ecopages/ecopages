import { appLogger } from "@/utils/app-logger";
import type { EcoPagesConfig } from "@types";
import { FileUtils } from "@/utils/file-utils.module";

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

    const scripts = await FileUtils.glob(`${srcDir}/**/*.${scriptDescriptor}.{ts,tsx}`, {cwd: "."});

    const build = await Bun.build({
      entrypoints: scripts,
      outdir: distDir,
      root: srcDir,
      target: "browser",
      minify: !this.options.watchMode,
      format: "esm",
      splitting: true,
    });

    if (!build.success) build.logs.forEach((log) => appLogger.debug(log));
  }
}
