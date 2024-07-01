import fs from 'node:fs';
import { appLogger } from '@/global/app-logger';
import type { EcoPagesConfig } from '..';
import type { CssBuilder } from './css-builder';
import type { ScriptsBuilder } from './scripts-builder';

export class ProjectWatcher {
  private config: EcoPagesConfig;
  private cssBuilder: CssBuilder;
  private scriptsBuilder: ScriptsBuilder;

  constructor(config: EcoPagesConfig, cssBuilder: CssBuilder, scriptsBuilder: ScriptsBuilder) {
    this.config = config;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
    this.handleAdd = this.handleAdd.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleUnlink = this.handleUnlink.bind(this);
    this.handleUnlinkDir = this.handleUnlinkDir.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  private uncacheModules(): void {
    const { srcDir, rootDir } = this.config;

    const regex = new RegExp(`${rootDir}/${srcDir}/.*`);

    for (const key in require.cache) {
      if (regex.test(key)) {
        delete require.cache[key];
      }
    }
  }

  handleAdd(path: string) {
    appLogger.info(`File ${path} has been added`);
  }

  handleChange(path: string) {
    if (path.endsWith('.css')) {
      this.cssBuilder.buildCssFromPath({ path: path });
      appLogger.info('CSS File changed', path.split(this.config.srcDir)[1]);
    } else if (this.config.scriptsExtensions.some((scriptsExtension) => path.endsWith(scriptsExtension))) {
      this.scriptsBuilder.build();
      this.uncacheModules();
      appLogger.info('File changed', path.split(this.config.srcDir)[1]);
    } else if (this.config.templatesExt.some((ext) => path.includes(ext))) {
      appLogger.info('Template file changed', path);
      this.uncacheModules();
    }
  }

  handleUnlink(path: string) {
    const pathToDelete = path.includes(this.config.pagesDir)
      ? `${path.replace(this.config.pagesDir, this.config.distDir).split('.')[0]}.html`
      : path.replace(this.config.srcDir, this.config.distDir);

    if (fs.existsSync(pathToDelete)) {
      fs.rmSync(pathToDelete);
      appLogger.info('File removed', pathToDelete);
    }
  }

  handleUnlinkDir(path: string) {
    fs.rmSync(path.replace(this.config.pagesDir, this.config.distDir), {
      recursive: true,
    });
    appLogger.info('Directory removed', path);
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
        if (event.type === 'delete') {
          if (!event.path.includes('.') && event.path.includes(this.config.pagesDir)) {
            this.handleUnlinkDir(event.path);
          } else {
            this.handleUnlink(event.path);
          }
          continue;
        }

        this.handleChange(event.path);
      }
    });
  }
}
