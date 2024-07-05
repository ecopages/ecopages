import path from 'node:path';
import { BunFileSystemServerAdapter } from '../adapters/bun/fs-server.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { FileUtils } from '../utils/file-utils.module.ts';

export class StaticPageGenerator {
  appConfig: EcoPagesAppConfig;

  constructor(config: EcoPagesAppConfig) {
    this.appConfig = config;
  }

  generateRobotsTxt(): void {
    let data = '';
    const preferences = this.appConfig.robotsTxt.preferences;

    for (const userAgent in preferences) {
      data += `user-agent: ${userAgent}\n`;
      for (const path of preferences[userAgent]) {
        data += `disallow: ${path}\n`;
      }
      data += '\n';
    }

    FileUtils.writeFileSync(`${this.appConfig.distDir}/robots.txt`, data);
  }

  async generateStaticPages() {
    const { router, server } = await BunFileSystemServerAdapter.createServer({
      appConfig: this.appConfig,
      options: {
        watchMode: false,
      },
    });

    const routes = Object.keys(router.routes).filter((route) => !route.includes('['));

    appLogger.debug('Static Pages', routes);

    for (const route of routes) {
      try {
        const response = await fetch(route);

        if (!response.ok) {
          console.error(`Failed to fetch ${route}. Status: ${response.status}`);
          continue;
        }

        let pathname = router.routes[route].pathname;

        if (router.routes[route].pathname.includes('[')) {
          pathname = route.replace(router.origin, '');
        }

        const filePath = path.join(this.appConfig.rootDir, this.appConfig.distDir, pathname, 'index.html');

        const contents = await response.text();

        FileUtils.write(filePath, contents);
      } catch (error) {
        console.error(`Error fetching or writing ${route}:`, error);
      }
    }

    server.stop();
  }

  async run() {
    this.generateRobotsTxt();
    await this.generateStaticPages();
  }
}
