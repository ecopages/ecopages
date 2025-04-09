import path from 'node:path';
import type { BunPlugin } from 'bun';
import { RESOLVED_ASSETS_DIR } from 'src/constants';
import { appLogger } from '../global/app-logger';
import type { EcoPagesAppConfig } from '../internal-types';
import { deepMerge } from '../utils/deep-merge';
import { FileUtils } from '../utils/file-utils.module';

/**
 * AssetCategory, the kind of the dependency
 */
export type AssetCategory = 'script' | 'stylesheet';

/**
 * AssetInjectionPosition, where the dependency should be injected
 */
export type AssetInjectionPosition = 'head' | 'body';

/**
 * AssetTarget, how the dependency is sourced
 */
export type AssetTarget = 'inline' | 'url' | 'nodeModule' | 'json';

/**
 * BaseDependency, common attributes for all dependencies
 */
export interface CoreAsset {
  kind: AssetCategory;
  attributes?: Record<string, string>;
  source: AssetTarget;
}

/**
 * This interface represents a dependency with inline content
 */
type InlinedAsset = {
  inline: true;
  content: string;
};

/**
 * This interface represents a script dependency with inline content
 */
export type InlineScriptAsset = CoreAsset &
  InlinedAsset & {
    kind: 'script';
    source: 'inline';
    position?: AssetInjectionPosition;
    minify?: boolean;
  };

/**
 * This interface represents a script dependency with a src URL
 */
export type ScriptAssetFromUrl = CoreAsset & {
  kind: 'script';
  source: 'url';
  position: AssetInjectionPosition;
  minify?: boolean;
  srcUrl: string;
};

/**
 * This interface represents a script dependency with a src URL that's already bundled
 */
export type PreBundledScriptAsset = CoreAsset & {
  kind: 'script';
  source: 'url';
  position: AssetInjectionPosition;
  srcUrl: string;
  preBundled: true;
};

/**
 * This interface represents a script dependency from node_modules
 */
export type ModuleScriptReference = CoreAsset & {
  kind: 'script';
  source: 'nodeModule';
  position: AssetInjectionPosition;
  minify?: boolean;
  importPath: string;
};

/**
 * This interface represents a script dependency with JSON content
 */
export type JsonScriptAsset = CoreAsset & {
  content: string;
  source: 'json';
  position?: AssetInjectionPosition;
};

/**
 * This interface represents a script dependency
 */
export type ScriptAsset =
  | InlineScriptAsset
  | ScriptAssetFromUrl
  | JsonScriptAsset
  | ModuleScriptReference
  | PreBundledScriptAsset;

/**
 * This interface represents a stylesheet dependency with inline content
 */
export type InlineStylesheetAsset = CoreAsset &
  InlinedAsset & {
    kind: 'stylesheet';
    position: Extract<AssetInjectionPosition, 'head'>;
  };

/**
 * This interface represents a stylesheet dependency with a src URL
 */
export type StylesheetAssetFromUrl = CoreAsset & {
  kind: 'stylesheet';
  position: Extract<AssetInjectionPosition, 'head'>;
  srcUrl: string;
};

/**
 * This interface represents a stylesheet dependency with a src URL that's already bundled
 */
export type PreBundledStylesheetAsset = CoreAsset & {
  kind: 'stylesheet';
  position: Extract<AssetInjectionPosition, 'head'>;
  srcUrl: string;
  preBundled: true;
};

/**
 * StylesheetAsset
 */
export type StylesheetAsset = InlineStylesheetAsset | StylesheetAssetFromUrl | PreBundledStylesheetAsset;

/**
 * Available assets types
 */
export type AssetDependency = ScriptAsset | StylesheetAsset;

/**
 * DependencyProvider
 * This interface represents a dependency provider that can provide dependencies
 */
export interface DependencyProvider {
  name: string;
  getDependencies(): AssetDependency[];
}

/**
 * ResolvedAsset
 * This interface represents a processed dependency that can be used to create the markup to inject
 */
export interface ResolvedAsset {
  provider: string;
  kind: AssetCategory;
  srcUrl: string;
  position?: AssetInjectionPosition;
  filePath: string;
  inline: boolean;
  attributes?: Record<string, string>;
  content?: string;
}

/**
 * AssetsServiceOptions
 * This interface represents the options that the DependencyService accepts
 */
export interface AssetsServiceOptions {
  appConfig: EcoPagesAppConfig;
}

/**
 * IAssetsDependencyService interface
 */
export interface IAssetsDependencyService {
  registerDependencies(source: DependencyProvider): void;
  unregisterDependencies(sourceName: string): void;
  getDependencies(sourceName: string): ResolvedAsset[];
  hasDependencies(sourceName: string): boolean;
  prepareDependencies(): Promise<ResolvedAsset[]>;
  cleanupPageDependencies(): void;
  invalidateCache(path?: string): void;
  setCurrentPath(path: string): void;
}

/**
 * AssetsDependencyService is responsible for:
 * - Managing assets providers
 * - Processing raw assets into processed ones
 * - Handling file operations (bundling, minification)
 * - Caching and optimization
 */
export class AssetsDependencyService implements IAssetsDependencyService {
  static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;

  private config: EcoPagesAppConfig;
  private dependencyMap = new Map<string, DependencyProvider>();
  private dependencies: ResolvedAsset[] = [];
  private dependencyCache = new Map<string, ResolvedAsset[]>();
  private currentPath = '/';
  private dynamicDependencyMap = new Map<string, ResolvedAsset>();

  constructor({ appConfig }: AssetsServiceOptions) {
    this.config = appConfig;
  }

  /**
   * Register dependencies for a component/page
   */
  registerDependencies(source: DependencyProvider): void {
    if (this.dependencyMap.has(source.name)) {
      appLogger.error(`Dependency source "${source.name}" already exists. Skipping registration.`);
      return;
    }
    this.dependencyMap.set(source.name, source);
    appLogger.debug(`Dependency source ${source.name} added`);
  }

  /**
   * Unregister dependencies for a component/page
   */
  unregisterDependencies(sourceName: string): void {
    this.dependencyMap.delete(sourceName);
  }

  /**
   * Check if dependencies exist for a provider
   */
  hasDependencies(sourceName: string): boolean {
    return this.dependencyMap.has(sourceName);
  }

  /**
   * Get dependencies for a provider
   */
  getDependencies(sourceName: string): ResolvedAsset[] {
    return this.dependencies.filter((dep) => dep.provider === sourceName);
  }

  /**
   * Cleans up all page-specific dependencies
   * This should be called when navigating between pages
   */
  cleanupPageDependencies(): void {
    const coreDependencies = Array.from(this.dependencyMap.entries())
      .filter(([name]) => this.isGlobalDependency(name))
      .map(([name, provider]): [string, DependencyProvider] => [name, provider]);

    this.dependencyMap = new Map(coreDependencies);
    this.dependencies = [];
    this.dynamicDependencyMap.clear();
  }

  /**
   * Invalidate the dependency cache for a specific path or all paths
   * @param path Optional path to invalidate cache for. If not provided, all cache will be cleared
   */
  invalidateCache(path?: string): void {
    if (path) {
      this.dependencyCache.delete(path);
    } else {
      this.dependencyCache.clear();
      this.dynamicDependencyMap.clear();
    }
  }

  setCurrentPath(path: string): void {
    this.currentPath = path;
  }

  private isGlobalDependency(name: string): boolean {
    return !name.includes('/');
  }

  private writeFileToDist({
    content,
    name,
    ext,
  }: {
    content: string | Buffer;
    name: string;
    ext: 'css' | 'js';
  }): { filepath: string } {
    const filepath = path.join(
      this.config.absolutePaths.distDir,
      AssetsDependencyService.RESOLVED_ASSETS_DIR,
      `${name}.${ext}`,
    );

    if (!FileUtils.existsSync(filepath)) {
      FileUtils.write(filepath, content);
      appLogger.debug(`Writing new dependency file: ${filepath}`);
    } else {
      appLogger.debug(`Reusing existing dependency file: ${filepath}`);
    }

    return { filepath };
  }

  private getSrcUrl(srcPath: string): string {
    const { distDir } = this.config;
    return srcPath.split(distDir)[1];
  }

  private collectBuildPlugins(): BunPlugin[] {
    const plugins: BunPlugin[] = [];

    for (const processor of this.config.processors.values()) {
      if (processor.buildPlugin) {
        plugins.push(processor.buildPlugin.createBuildPlugin());
      }
    }

    return plugins;
  }

  private async bundleScript({
    entrypoint,
    outdir,
    minify = import.meta.env.NODE_ENV !== 'development',
  }: {
    entrypoint: string;
    outdir: string;
    minify?: boolean;
  }): Promise<string> {
    const build = await Bun.build({
      entrypoints: [entrypoint],
      outdir,
      root: this.config.rootDir,
      target: 'browser',
      minify,
      format: 'esm',
      splitting: true,
      naming: '[name].[ext]',
      plugins: this.collectBuildPlugins(),
    });

    return build.outputs[0].path;
  }

  /**
   * This method is responsible for preparing the assets dependencies
   * It will process all the dependencies and write them to the dist directory
   * @returns {@link ResolvedAsset[]}
   */
  async prepareDependencies(): Promise<ResolvedAsset[]> {
    const cacheKey = this.getCurrentRouteKey();
    if (this.dependencyCache.has(cacheKey)) {
      return this.dependencyCache.get(cacheKey) as ResolvedAsset[];
    }

    this.dependencies = [];

    for (const provider of this.dependencyMap.values()) {
      const deps = provider.getDependencies();
      await this.processDependencies(provider, deps);
    }

    await this.optimizeDependencies();
    this.dependencyCache.set(cacheKey, this.dependencies);

    return this.dependencies;
  }

  private getCurrentRouteKey(): string {
    return this.currentPath;
  }

  /**
   * This method is responsible for processing dependencies
   * This is where we inline the content of the dependencies and write them to the dist directory
   * @param provider {@link DependencyProvider}
   * @param deps {@link AssetDependency[]}
   */
  private async processDependencies(provider: DependencyProvider, deps: AssetDependency[]): Promise<void> {
    for (const dep of deps) {
      if (this.isDynamicDependency(dep)) {
        await this.processDynamicDependency(dep as ScriptAssetFromUrl);
        continue;
      }

      const depsDir = path.join(this.config.absolutePaths.distDir, AssetsDependencyService.RESOLVED_ASSETS_DIR);
      FileUtils.ensureDirectoryExists(depsDir);

      const result = await this.processDepFile(dep, provider, depsDir);

      const processedDep: ResolvedAsset = {
        provider: provider.name,
        kind: dep.kind,
        inline: this.isInlineDependency(dep),
        filePath: result.filepath,
        srcUrl: result.filepath,
        attributes: dep.attributes,
        position: dep.position,
      };

      if (processedDep.inline) {
        processedDep.content = result.content;
      } else if (!('preBundled' in dep)) {
        processedDep.srcUrl = this.getSrcUrl(result.filepath);
      }

      this.dependencies.push(processedDep);
    }
  }

  private isDynamicDependency(dep: AssetDependency): dep is ScriptAssetFromUrl {
    return dep.kind === 'script' && dep.source === 'url' && dep.srcUrl.includes('?dynamic=true');
  }

  private async processDynamicDependency(dep: ScriptAssetFromUrl): Promise<void> {
    try {
      const assetPath = dep.srcUrl.replace('?dynamic=true', '');
      const cacheKey = `dynamic:${assetPath}`;

      if (!this.dynamicDependencyMap.has(cacheKey)) {
        const pathFromSrcDir = assetPath.split(this.config.srcDir)[1];
        const depsDir = path.join(
          this.config.absolutePaths.distDir,
          AssetsDependencyService.RESOLVED_ASSETS_DIR,
          path.dirname(pathFromSrcDir),
        );

        FileUtils.ensureDirectoryExists(depsDir);

        if (!FileUtils.existsSync(assetPath)) {
          throw new Error(`Dynamic script not found: ${assetPath}`);
        }

        const result = await this.processDepFile(
          {
            ...dep,
            srcUrl: assetPath,
          },
          { name: 'dynamic' },
          depsDir,
        );

        this.dynamicDependencyMap.set(cacheKey, {
          provider: 'dynamic',
          kind: dep.kind,
          srcUrl: this.getSrcUrl(result.filepath),
          position: dep.position,
          filePath: result.filepath,
          inline: false,
          attributes: dep.attributes,
        });
      }
    } catch (error) {
      appLogger.error(
        `Failed to process dynamic dependency: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isInlineDependency(dep: AssetDependency): boolean {
    if ('inline' in dep) {
      return dep.inline === true;
    }
    return 'content' in dep;
  }

  private getCleanAssetUrl(srcPath: string): string {
    const { srcDir } = this.config;
    const url = srcPath.split(srcDir)[1];
    return url.split('.').slice(0, -1).join('.');
  }

  private async processDepFile(
    dep: AssetDependency,
    provider: DependencyProvider | { name: string },
    depsDir: string,
  ): Promise<{ filepath: string; content: string }> {
    if ('preBundled' in dep && dep.preBundled) {
      return { filepath: dep.srcUrl, content: '' };
    }

    const processors: Record<AssetTarget, (dep: AssetDependency) => Promise<{ filepath: string; content: string }>> = {
      nodeModule: async (dep) => {
        const nodeDep = dep as ModuleScriptReference;
        const absolutePath = this.findNodeModuleDependency(nodeDep.importPath);
        const filepath = await this.bundleScript({
          entrypoint: absolutePath,
          outdir: depsDir,
          minify: nodeDep.minify,
        });
        const content = FileUtils.readFileSync(filepath, 'utf-8');
        return { filepath, content };
      },

      url: async (dep) => {
        if (dep.kind === 'script') {
          const scriptDep = dep as ScriptAssetFromUrl;
          const filepath = await this.bundleScript({
            entrypoint: scriptDep.srcUrl,
            outdir: depsDir,
            minify: scriptDep.minify,
          });
          const content = FileUtils.readFileSync(filepath, 'utf-8');
          const { filepath: cleanedFilepath } = this.writeFileToDist({
            content,
            name: this.getCleanAssetUrl(scriptDep.srcUrl),
            ext: 'js',
          });
          return {
            filepath: cleanedFilepath,
            content,
          };
        }
        const styleDep = dep as StylesheetAssetFromUrl;
        const buffer = await import(styleDep.srcUrl).then((module) => module.default);
        const { filepath } = this.writeFileToDist({
          content: buffer,
          name: this.getCleanAssetUrl(styleDep.srcUrl),
          ext: 'css',
        });
        return {
          filepath,
          content: buffer.toString('utf-8'),
        };
      },

      inline: async (dep) => {
        const inlineDep = dep as InlineScriptAsset;
        const { filepath } = this.writeFileToDist({
          content: inlineDep.content,
          name: `inline-${inlineDep.kind}`,
          ext: dep.kind === 'script' ? 'js' : 'css',
        });
        return {
          filepath,
          content: inlineDep.content,
        };
      },

      json: async (dep) => {
        const jsonDep = dep as JsonScriptAsset;
        return {
          filepath: '',
          content: jsonDep.content,
        };
      },
    };

    try {
      return await processors[dep.source](dep);
    } catch (error) {
      throw new Error(
        `Failed to process dependency from provider ${provider.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async optimizeDependencies(): Promise<void> {
    if (this.dependencies.length) {
      FileUtils.gzipDirSync(path.join(this.config.absolutePaths.distDir, AssetsDependencyService.RESOLVED_ASSETS_DIR), [
        'css',
        'js',
      ]);
    }
  }

  private findAbsolutePathInNodeModules(importPath: string, currentDir: string, maxDepth: number): string {
    const nodeModulesPath = path.join(currentDir, 'node_modules');
    if (FileUtils.existsSync(nodeModulesPath)) {
      const dependencyPackage = importPath.split('/')[0];
      const packageUrl = path.join(nodeModulesPath, dependencyPackage);
      const packageExists = FileUtils.existsSync(packageUrl);
      if (packageExists) {
        return path.join(nodeModulesPath, importPath);
      }
    }
    const parentDir = path.resolve(currentDir, '..');

    if (maxDepth === 0) {
      throw new Error(`Could not find node_modules containing the file: ${importPath}`);
    }
    return this.findAbsolutePathInNodeModules(importPath, parentDir, maxDepth - 1);
  }

  private findNodeModuleDependency(importPath: string): string {
    let absolutePath = path.join(this.config.rootDir, 'node_modules', importPath);
    if (!FileUtils.existsSync(absolutePath)) {
      absolutePath = this.findAbsolutePathInNodeModules(importPath, this.config.rootDir, 5);
    }
    return absolutePath;
  }
}

/**
 * CreateDependecy
 * Helper type to create a dependency type
 */
type CreateDependencyPartial<T extends AssetDependency, U extends keyof T> = Partial<Pick<T, 'position'>> & Pick<T, U>;

/**
 * Helper class to create script and stylesheet dependencies
 */
export class AssetDependencyHelpers {
  static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;
  /**
   * Create a script dependency with inline content
   * @param options {@link ScriptAsset}
   * @returns
   */
  static createInlineScriptAsset = ({
    position = 'body',
    ...options
  }: CreateDependencyPartial<InlineScriptAsset, 'content' | 'attributes'>): ScriptAsset => {
    return {
      kind: 'script',
      source: 'inline',
      inline: true,
      position,
      ...options,
    };
  };

  /**
   * Create a script dependency with a src URL
   * @param options {@link ScriptAsset}
   * @returns
   */
  static createSrcScriptAsset = ({
    position = 'body',
    ...options
  }: CreateDependencyPartial<ScriptAssetFromUrl, 'srcUrl' | 'attributes'>): ScriptAsset => {
    return {
      kind: 'script',
      source: 'url',
      position,
      ...options,
    };
  };

  static createNodeModuleScriptAsset = ({
    position = 'body',
    ...options
  }: CreateDependencyPartial<ModuleScriptReference, 'importPath' | 'attributes'>): ScriptAsset => {
    return {
      kind: 'script',
      source: 'nodeModule',
      position,
      ...options,
    };
  };

  /**
   * Create a script dependency with a JSON content
   * @param options {@link JsonScriptAsset}
   * @returns
   */
  static createJsonAssetScript = ({
    attributes,
    position = 'body',
    ...options
  }: CreateDependencyPartial<JsonScriptAsset, 'content' | 'attributes'>): ScriptAsset => {
    return {
      kind: 'script',
      source: 'json',
      attributes: deepMerge(attributes, { type: 'application/json' }),
      position,
      ...options,
    };
  };

  /**
   * Create a stylesheet dependency with inline content
   * @param options {@link InlineStylesheetAsset}
   * @returns
   */
  static createInlineStylesheetAsset = ({
    ...options
  }: CreateDependencyPartial<InlineStylesheetAsset, 'content' | 'attributes'>): StylesheetAsset => {
    return {
      kind: 'stylesheet',
      source: 'inline',
      inline: true,
      position: 'head',
      ...options,
    };
  };

  /**
   * Create a stylesheet dependency with a src URL
   * @param options {@link StylesheetAssetFromUrl}
   * @returns
   */
  static createStylesheetAsset = ({
    position = 'head',
    ...options
  }: CreateDependencyPartial<StylesheetAssetFromUrl, 'srcUrl' | 'attributes'>): StylesheetAsset => {
    return {
      kind: 'stylesheet',
      position,
      source: 'url',
      ...options,
    };
  };

  /**
   * Create a script dependency with a src URL that's already bundled
   * @param options {@link PreBundledScriptAsset}
   * @returns
   */
  static createPreBundledScriptAsset = ({
    position = 'body',
    ...options
  }: CreateDependencyPartial<PreBundledScriptAsset, 'srcUrl' | 'attributes'>): PreBundledScriptAsset => {
    return {
      kind: 'script',
      source: 'url',
      position,
      preBundled: true,
      ...options,
    };
  };

  /**
   * Create a stylesheet dependency with a src URL that's already bundled
   * @param options {@link PreBundledStylesheetAsset}
   * @returns
   */
  static createPreBundledStylesheetAsset = ({
    position = 'head',
    ...options
  }: CreateDependencyPartial<PreBundledStylesheetAsset, 'srcUrl' | 'attributes'>): PreBundledStylesheetAsset => {
    return {
      kind: 'stylesheet',
      source: 'url',
      position,
      preBundled: true,
      ...options,
    };
  };
}
