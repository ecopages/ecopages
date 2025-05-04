import chokidar, { type FSWatcher } from 'chokidar';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';

type ProjectWatcherConfig = {
  config: EcoPagesAppConfig;
  refreshRouterRoutesCallback: () => void;
};

export class ProjectWatcher {
  private appConfig: EcoPagesAppConfig;
  private refreshRouterRoutesCallback: () => void;
  private watcher: FSWatcher | undefined;

  constructor({ config, refreshRouterRoutesCallback }: ProjectWatcherConfig) {
    import.meta.env.NODE_ENV = 'development';
    this.appConfig = config;
    this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
    this.triggerRouterRefresh = this.triggerRouterRefresh.bind(this);
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

  triggerRouterRefresh(path: string) {
    const isPageDir = path.includes(this.appConfig.pagesDir);
    if (isPageDir) this.refreshRouterRoutesCallback();
  }

  handleError(error: Error) {
    appLogger.error(`Watcher error: ${error}`);
  }

  private shouldProcess(path: string, extensions: string[], handler: (path: string) => void) {
    if (!extensions.length || extensions.some((ext) => path.endsWith(ext))) {
      handler(path);
    }
  }

  public async createWatcherSubscription() {
    if (!this.watcher) {
      const processorPaths: string[] = [];
      for (const processor of this.appConfig.processors.values()) {
        const watchConfig = processor.getWatchConfig();
        if (!watchConfig) continue;
        processorPaths.push(...watchConfig.paths);
      }

      processorPaths.push(this.appConfig.absolutePaths.pagesDir);

      this.watcher = chokidar.watch(processorPaths, { ignoreInitial: true });
    }

    for (const processor of this.appConfig.processors.values()) {
      const watchConfig = processor.getWatchConfig();
      if (!watchConfig) continue;
      const { extensions = [], onCreate, onChange, onDelete, onError } = watchConfig;

      if (onCreate) this.watcher.on('add', (path) => this.shouldProcess(path, extensions, onCreate));
      if (onChange) this.watcher.on('change', (path) => this.shouldProcess(path, extensions, onChange));
      if (onDelete) this.watcher.on('unlink', (path) => this.shouldProcess(path, extensions, onDelete));
      if (onError) this.watcher.on('error', onError as (error: unknown) => void);
    }

    this.watcher.add(this.appConfig.absolutePaths.srcDir);

    this.watcher
      .on('change', () => this.uncacheModules())
      .on('add', (path) => this.triggerRouterRefresh(path))
      .on('addDir', (path) => this.triggerRouterRefresh(path))
      .on('unlink', (path) => this.triggerRouterRefresh(path))
      .on('unlinkDir', (path) => this.triggerRouterRefresh(path))
      .on('error', (error) => this.handleError(error as Error));

    return this.watcher;
  }
}
