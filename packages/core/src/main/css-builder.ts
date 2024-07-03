import fs from 'node:fs';
import { appLogger } from '../global/app-logger';
import type { EcoPagesAppConfig } from '../internal-types';
import type { CssProcessor } from '../public-types';
import { FileUtils } from '../utils/file-utils.module';

export class CssBuilder {
  processor: CssProcessor;
  appConfig: EcoPagesAppConfig;

  constructor({ processor, appConfig: config }: { processor: CssProcessor; appConfig: EcoPagesAppConfig }) {
    this.processor = processor;
    this.appConfig = config;
  }

  async buildCssFromPath({ path }: { path: string }) {
    const { srcDir, distDir } = this.appConfig;
    const content = await this.processor.processPath(path);

    const outputFileName = path.replace(srcDir, distDir);
    const directory = outputFileName.split('/').slice(0, -1).join('/');

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(outputFileName, content);
  }

  async build() {
    const { srcDir } = this.appConfig;
    const cssFiles = await FileUtils.glob([`${srcDir}/**/*.css`]);
    appLogger.debug('Building CSS files:', cssFiles);
    for (const path of cssFiles) {
      if (path.endsWith('.shadow.css')) {
        continue;
      }
      await this.buildCssFromPath({ path });
    }
  }
}
