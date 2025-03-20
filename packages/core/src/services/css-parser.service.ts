import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { CssProcessor } from '../public-types.ts';
import { FileUtils } from '../utils/file-utils.module.ts';

export class CssParserService {
  processor: CssProcessor;
  appConfig: EcoPagesAppConfig;

  constructor({
    processor,
    appConfig: config,
  }: {
    processor: CssProcessor;
    appConfig: EcoPagesAppConfig;
  }) {
    this.processor = processor;
    this.appConfig = config;
  }

  async buildCssFromPath({ path }: { path: string }) {
    const { srcDir, distDir } = this.appConfig;
    const content = await this.processor.processPath(path);

    const outputFileName = path.replace(srcDir, distDir);
    const directory = outputFileName.split('/').slice(0, -1).join('/');

    FileUtils.ensureDirectoryExists(directory);
    FileUtils.writeFileSync(outputFileName, content);
  }

  async build() {
    const { srcDir } = this.appConfig;
    const cssFiles = await FileUtils.glob([`${srcDir}/**/*.css`]);
    appLogger.debug('Building CSS files:', cssFiles);
    const files = cssFiles.filter((path) => !path.endsWith('.shadow.css'));
    await Promise.all(files.map((path) => this.buildCssFromPath({ path })));
  }
}
