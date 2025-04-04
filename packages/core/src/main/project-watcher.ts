import fs from 'node:fs';
import { join } from 'node:path';
import watcher from '@parcel/watcher';
import type { EventType } from '@parcel/watcher';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { FSRouter } from '../router/fs-router.ts';
import type { ScriptsBuilder } from './scripts-builder.ts';

type ProjectWatcherConfig = {
  config: EcoPagesAppConfig;
  scriptsBuilder: ScriptsBuilder;
  router: FSRouter;
};

export class ProjectWatcher {
  private appConfig: EcoPagesAppConfig;
  private scriptsBuilder: ScriptsBuilder;
  private router: FSRouter;

  constructor({ config, scriptsBuilder, router }: ProjectWatcherConfig) {
    this.appConfig = config;
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

    if (this.isFileOfType(path, this.appConfig.scriptsExtensions)) {
      await this.scriptsBuilder.build();
      this.uncacheModules();
      appLogger.info(`File ${actionVerb}`, updatedFileName);
      return;
    }

    if (this.isFileOfType(path, this.appConfig.templatesExt)) {
      appLogger.info(`Template file ${actionVerb}:`, updatedFileName);
      this.uncacheModules();
      return;
    }

    if (this.isAdditionalWatchPath(path)) {
      appLogger.info(`Additional watch file ${actionVerb}:`, updatedFileName);
      this.uncacheModules();
    }
  }

  handleError(error: Error) {
    appLogger.error(`Watcher error: ${error}`);
  }

  public async createWatcherSubscription() {
    await this.setupProcessorWatchers();
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

  private async setupProcessorWatchers() {
    for (const processor of this.appConfig.processors.values()) {
      const watchConfig = processor.getWatchConfig();
      if (!watchConfig) continue;

      const { paths, extensions, onCreate, onChange, onDelete, onError } = watchConfig;

      for (const watchPath of paths) {
        const watcher = await import('@parcel/watcher');
        await watcher.subscribe(watchPath, async (err, events) => {
          if (err) {
            onError?.(err);
            return;
          }

          for (const event of events) {
            const isMatchingExtension = !extensions?.length || extensions.some((ext) => event.path.endsWith(ext));

            if (!isMatchingExtension) continue;

            switch (event.type) {
              case 'create':
                await onCreate?.(event.path);
                break;
              case 'update':
                await onChange?.(event.path);
                break;
              case 'delete':
                await onDelete?.(event.path);
                break;
            }
          }
        });
      }
    }
  }
}
