import fs from 'node:fs';
import { join } from 'node:path';
import type { EventType } from '@parcel/watcher';
import type { FSRouter } from 'src/router/fs-router.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { CssBuilder } from './css-builder.ts';
import type { ScriptsBuilder } from './scripts-builder.ts';

export class ProjectWatcher {
  private appConfig: EcoPagesAppConfig;
  private cssBuilder: CssBuilder;
  private scriptsBuilder: ScriptsBuilder;
  private router: FSRouter;

  constructor({
    config,
    cssBuilder,
    scriptsBuilder,
    router,
  }: { config: EcoPagesAppConfig; cssBuilder: CssBuilder; scriptsBuilder: ScriptsBuilder; router: FSRouter }) {
    this.appConfig = config;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.router = router;
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
  }

  handleChange(path: string, type: EventType) {
    const updatedFileName = path.replace(`${this.appConfig.absolutePaths.srcDir}/`, '');
    const actionVerb = `${type}d`;

    if (path.endsWith('.css')) {
      this.cssBuilder.buildCssFromPath({ path: path });
      appLogger.info(`CSS File ${actionVerb}:`, updatedFileName);
    } else if (this.appConfig.scriptsExtensions.some((scriptsExtension) => path.endsWith(scriptsExtension))) {
      this.scriptsBuilder.build();
      this.uncacheModules();
      appLogger.info(`File ${actionVerb}`, updatedFileName);
    } else if (this.appConfig.templatesExt.some((ext) => path.includes(ext))) {
      appLogger.info(`Template file ${actionVerb}:`, updatedFileName);
      this.uncacheModules();
    } else if (
      this.appConfig.additionalWatchPaths.some((additionalPath) =>
        path.includes(join(this.appConfig.rootDir, additionalPath)),
      )
    ) {
      appLogger.info(`Additional watch file ${actionVerb}:`, updatedFileName);
      this.uncacheModules();
    }
  }

  handleError(error: Error) {
    appLogger.error(`Watcher error: ${error}`);
  }

  public async createWatcherSubscription() {
    const watcher = await import('@parcel/watcher');
    return watcher.subscribe('src', (err, events) => {
      if (err) {
        this.handleError(err);
        return;
      }

      for (const event of events) {
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

        this.handleChange(event.path, event.type);
      }
    });
  }
}