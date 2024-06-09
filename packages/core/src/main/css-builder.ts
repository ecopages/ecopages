import fs from 'node:fs';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import type { CssProcessor, EcoPagesConfig } from '@types';

export class CssBuilder {
  processor: CssProcessor;
  config: EcoPagesConfig;

  constructor({ processor, config }: { processor: CssProcessor; config: EcoPagesConfig }) {
    this.processor = processor;
    this.config = config;
  }

  async buildCssFromPath({ path }: { path: string }) {
    const { srcDir, distDir } = this.config;
    const content = await this.processor.processPath(path);

    const outputFileName = path.replace(srcDir, distDir);
    const directory = outputFileName.split('/').slice(0, -1).join('/');

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(outputFileName, content);
  }

  async build() {
    const { srcDir } = this.config;
    const cssFiles = FileUtils.glob([`${srcDir}/**/*.css`]);
    appLogger.debug('Building CSS files:', cssFiles);
    for (const path of cssFiles) {
      if (path.endsWith('.shadow.css')) {
        continue;
      }
      await this.buildCssFromPath({ path });
    }
  }
}
