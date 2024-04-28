import fs from 'node:fs';
import { appLogger } from '@/utils/app-logger';
import watcher from '@parcel/watcher';
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
  }

  private uncacheModules(): void {
    const { srcDir, rootDir } = globalThis.ecoConfig;

    const regex = new RegExp(`${rootDir}/${srcDir}/.*`);

    for (const key in require.cache) {
      if (regex.test(key)) {
        delete require.cache[key];
      }
    }
    console.log('this.uncacheModules');
  }

  public async createWatcherSubscription() {
    return watcher.subscribe('src', (err, events) => {
      if (err) {
        console.error('Error watching files', err);
        return;
      }

      const { srcDir, distDir, pagesDir, scriptDescriptor, templatesExt } = this.config;

      for (const event of events) {
        if (event.type === 'delete') {
          if (!event.path.includes('.') && event.path.includes(pagesDir)) {
            fs.rmSync(event.path.replace(pagesDir, distDir), {
              recursive: true,
            });
          } else {
            const pathToDelete = event.path.includes(pagesDir)
              ? `${event.path.replace(pagesDir, distDir).split('.')[0]}.html`
              : event.path.replace(srcDir, distDir);

            if (fs.existsSync(pathToDelete)) {
              fs.rmSync(pathToDelete);
            }
          }
          continue;
        }

        if (event.path.endsWith('.css')) {
          this.cssBuilder.buildCssFromPath({ path: event.path });
          appLogger.info('File changed', event.path.split(srcDir)[1]);
        } else if (event.path.includes(`.${scriptDescriptor}.`)) {
          this.scriptsBuilder.build();
          this.uncacheModules();
          appLogger.info('File changed', event.path.split(srcDir)[1]);
        } else if (templatesExt.some((ext) => event.path.includes(ext))) {
          appLogger.info('Template file changed', event.path);
          this.uncacheModules();
        }
      }
    });
  }
}
