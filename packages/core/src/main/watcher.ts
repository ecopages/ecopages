import fs from 'node:fs';
import { appLogger } from '@/utils/app-logger';
import watcher from '@parcel/watcher';
import type { CssBuilder } from './css-builder';
import type { ScriptsBuilder } from './scripts-builder';

export class ProjectWatcher {
  private cssBuilder: CssBuilder;
  private scriptsBuilder: ScriptsBuilder;

  constructor(cssBuilder: CssBuilder, scriptsBuilder: ScriptsBuilder) {
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
  }

  public async createWatcherSubscription() {
    return watcher.subscribe('src', (err, events) => {
      if (err) {
        console.error('Error watching files', err);
        return;
      }

      const { ecoConfig: config } = globalThis;

      for (const event of events) {
        if (event.type === 'delete') {
          if (!event.path.includes('.') && event.path.includes(config.pagesDir)) {
            fs.rmSync(event.path.replace(config.pagesDir, config.distDir), {
              recursive: true,
            });
          } else {
            const pathToDelete = event.path.includes(config.pagesDir)
              ? `${event.path.replace(config.pagesDir, config.distDir).split('.')[0]}.html`
              : event.path.replace(config.srcDir, config.distDir);

            if (fs.existsSync(pathToDelete)) {
              fs.rmSync(pathToDelete);
            }
          }
          continue;
        }

        if (event.path.endsWith('.css')) {
          this.cssBuilder.buildCssFromPath({ path: event.path });
          appLogger.info('File changed', event.path.split(config.srcDir)[1]);
        } else if (event.path.includes(`.${config.scriptDescriptor}.`)) {
          this.scriptsBuilder.build();
          appLogger.info('File changed', event.path.split(config.srcDir)[1]);
        }
      }
    });
  }
}