import path from 'node:path';
import { BunFileSystemServerAdapter } from '../adapters/bun/fs-server.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { FileUtils } from '../utils/file-utils.module.ts';
import { IntegrationManager } from './integration-manager.ts';

const STATIC_GENERATION_ADAPTER_PORT = 2020;
const STATIC_GENERATION_ADAPTER_BASE_URL = `http://localhost:${STATIC_GENERATION_ADAPTER_PORT}`;

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

  isRootDir(path: string) {
    const slashes = path.match(/\//g);
    return slashes && slashes.length === 1;
  }

  getDirectories(routes: string[]) {
    const directories = new Set<string>();

    for (const route of routes) {
      const path = route.replace(STATIC_GENERATION_ADAPTER_BASE_URL, '');

      const segments = path.split('/');

      if (segments.length > 2) {
        directories.add(segments.slice(0, segments.length - 1).join('/'));
      }
    }

    return Array.from(directories);
  }

  async prepareDependencies() {
    const integrationManager = new IntegrationManager({ appConfig: this.appConfig });
    await integrationManager.prepareDependencies();
  }

  async generateStaticPages() {
    const { router, server } = await BunFileSystemServerAdapter.createServer({
      appConfig: {
        ...this.appConfig,
        baseUrl: STATIC_GENERATION_ADAPTER_BASE_URL,
      },
      options: {
        watchMode: false,
        port: STATIC_GENERATION_ADAPTER_PORT,
      },
    });

    const routes = Object.keys(router.routes).filter((route) => !route.includes('['));

    appLogger.debug('Static Pages', routes);

    const directories = this.getDirectories(routes);

    for (const directory of directories) {
      FileUtils.ensureDirectoryExists(path.join(this.appConfig.rootDir, this.appConfig.distDir, directory));
    }

    for (const route of routes) {
      try {
        const response = await fetch(route);

        if (!response.ok) {
          console.error(`Failed to fetch ${route}. Status: ${response.status}`);
          continue;
        }

        let pathname = router.routes[route].pathname;

        const pathnameSegments = pathname.split('/').filter(Boolean);

        if (pathname === '/') {
          pathname = '/index.html';
        } else if (pathnameSegments.join('/').includes('[')) {
          pathname = `${route.replace(router.origin, '')}.html`;
        } else if (pathnameSegments.length >= 1 && directories.includes(`/${pathnameSegments.join('/')}`)) {
          pathname = `${pathname.endsWith('/') ? pathname : `${pathname}/`}index.html`;
        } else {
          pathname += '.html';
        }

        const filePath = path.join(this.appConfig.rootDir, this.appConfig.distDir, pathname);

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
    await this.prepareDependencies();
    await this.generateStaticPages();
  }
}
