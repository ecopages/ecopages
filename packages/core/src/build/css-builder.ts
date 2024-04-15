import fs from "node:fs";
import type { CssProcessor, EcoPagesConfig } from "@types";
import { Glob } from "bun";

export class CssBuilder {
  processor: CssProcessor;
  config: EcoPagesConfig;

  constructor({ processor, config }: { processor: CssProcessor; config: EcoPagesConfig }) {
    this.processor = processor;
    this.config = config;
  }

  async buildCssFromPath({ path }: { path: string }) {
    const { srcDir, distDir } = this.config;
    const content = await this.processor.process(path);

    const outputFileName = path.replace(srcDir, distDir);
    const directory = outputFileName.split("/").slice(0, -1).join("/");

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(outputFileName, content);
  }

  async build() {
    const { srcDir } = this.config;
    const glob = new Glob(`${srcDir}/**/*.css`);
    const scannedFiles = glob.scanSync({ cwd: "." });
    const cssFiles = Array.from(scannedFiles);
    for (const path of cssFiles) {
      await this.buildCssFromPath({ path });
    }
  }
}
