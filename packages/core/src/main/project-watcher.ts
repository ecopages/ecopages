import fs from 'node:fs';
import { join } from 'node:path';
import type { ImageProcessor } from '@ecopages/image-processor';
import type { EventType } from '@parcel/watcher';
import type { FSRouter } from 'src/router/fs-router.ts';
import { FileUtils } from 'src/utils/file-utils.module.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { CssBuilder } from './css-builder.ts';
import type { ScriptsBuilder } from './scripts-builder.ts';

type ProjectWatcherConfig = {
  config: EcoPagesAppConfig;
  cssBuilder: CssBuilder;
  scriptsBuilder: ScriptsBuilder;
  router: FSRouter;
  execTailwind: () => Promise<void>;
  imageProcessor?: ImageProcessor;
};

export class ProjectWatcher {
  private appConfig: EcoPagesAppConfig;
  private imageProcessor?: ImageProcessor;
  private cssBuilder: CssBuilder;
  private scriptsBuilder: ScriptsBuilder;
  private router: FSRouter;
  private execTailwind: () => Promise<void>;

  constructor({ config, cssBuilder, scriptsBuilder, imageProcessor, router, execTailwind }: ProjectWatcherConfig) {
    this.appConfig = config;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.imageProcessor = imageProcessor;
    this.router = router;
    this.execTailwind = execTailwind;
    this.handlePageCreation = this.handlePageCreation.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleDelete = this.handleDelete.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  private uncacheModules(): void {
    const { srcDir, rootDir } = this.appConfig;

    const regex = new RegExp(`${rootDir}/${srcDir}/.*`);

    for (const key in require.cache) {
      if (regex.test(key)) {
        delete require.cache[key];
      }
    }
  }

  handlePageCreation(path: string, isDir?: boolean) {
    this.router.reload();
    appLogger.info(
      `New ${isDir ? 'directory' : 'page'} has been added:`,
      path.replace(`${this.appConfig.absolutePaths.srcDir}/`, ''),
    );
  }

  handleDelete(path: string, isDir?: boolean) {
    const distPathToRemove = path.replace(this.appConfig.srcDir, this.appConfig.distDir);
    const isPageDir = path.includes(this.appConfig.pagesDir);

    if (fs.existsSync(distPathToRemove)) {
      fs.rmSync(distPathToRemove, isDir ? { recursive: true } : {});
      appLogger.info(
        `${isDir ? 'Directory' : 'File'} has been removed:`,
        path.replace(`${this.appConfig.absolutePaths.srcDir}/`, ''),
      );
    }

    if (isPageDir) {
      this.router.reload();
    }

    if (this.imageProcessor && path.includes(this.imageProcessor.getResolvedPath().sourceImages)) {
      const imageMap = this.imageProcessor.getImageMap();
      const displayPath = this.imageProcessor.resolveImageDisplayPath(path);

      if (imageMap[displayPath]?.variants) {
        for (const variant of imageMap[displayPath].variants) {
          fs.rmSync(variant.originalPath, { force: true });
        }
        appLogger.info('Image removed:', path);
      }
    }
  }

  private isFileOfType(path: string, extensions: string[]): boolean {
    return extensions.some((ext) => path.endsWith(ext));
  }

  private isAdditionalWatchPath(path: string): boolean {
    return this.appConfig.additionalWatchPaths.some((additionalPath) =>
      path.includes(join(this.appConfig.rootDir, additionalPath)),
    );
  }

  async handleChange(path: string, type: EventType) {
    const updatedFileName = path.replace(`${this.appConfig.absolutePaths.srcDir}/`, '');
    const actionVerb = `${type}d`;

    if (this.isFileOfType(path, ['.css'])) {
      this.cssBuilder.buildCssFromPath({ path });
      appLogger.info(`CSS File ${actionVerb}:`, updatedFileName);
      return;
    }

    if (this.isFileOfType(path, this.appConfig.scriptsExtensions)) {
      await this.execTailwind();
      this.scriptsBuilder.build();
      this.uncacheModules();
      appLogger.info(`File ${actionVerb}`, updatedFileName);
      return;
    }

    if (this.isFileOfType(path, this.appConfig.templatesExt)) {
      await this.execTailwind();
      appLogger.info(`Template file ${actionVerb}:`, updatedFileName);
      this.uncacheModules();
      return;
    }

    if (this.isAdditionalWatchPath(path)) {
      appLogger.info(`Additional watch file ${actionVerb}:`, updatedFileName);
      this.uncacheModules();
    }

    if (this.imageProcessor && path.includes(this.imageProcessor.getResolvedPath().sourceImages)) {
      await this.imageProcessor.processImage(path);
      appLogger.info(`Image ${actionVerb}:`, updatedFileName);
    }
  }

  handleError(error: Error) {
    appLogger.error(`Watcher error: ${error}`);
  }

  public async createWatcherSubscription() {
    const watcher = await import('@parcel/watcher');
    return watcher.subscribe('src', async (err, events) => {
      if (err) {
        this.handleError(err);
        return;
      }

      for await (const event of events) {
        const isDir = !event.path.includes('.');
        const isCss = event.path.endsWith('.css');
        const isPage = event.path.includes(this.appConfig.absolutePaths.pagesDir) && !isDir && !isCss;

        if (event.type === 'delete') {
          this.handleDelete(event.path, isDir);
          continue;
        }

        if (event.type === 'create' && isPage) {
          this.handlePageCreation(event.path, isDir);
        }

        await this.handleChange(event.path, event.type);
      }
    });
  }
}
