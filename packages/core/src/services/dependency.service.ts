import path from 'node:path';
import { appLogger } from 'src/global/app-logger';
import type { EcoPagesAppConfig } from '../internal-types';
import { deepMerge } from '../utils/deep-merge';
import { FileUtils } from '../utils/file-utils.module';

/**
 * DependencyKind, the kind of the dependency
 */
export type DependencyKind = 'script' | 'stylesheet';

/**
 * DependencyPosition, where the dependency should be injected
 */
export type DependencyPosition = 'head' | 'body';

/**
 * DependencySource, how the dependency is sourced
 */
export type DependencySource = 'inline' | 'url' | 'nodeModule' | 'json';

/**
 * BaseDependency, common attributes for all dependencies
 */
export interface BaseDependency {
  kind: DependencyKind;
  attributes?: Record<string, string>;
  source: DependencySource;
}

/**
 * This interface represents a dependency with inline content
 */
type InlinedDependency = {
  inline: true;
  content: string;
};

/**
 * This interface represents a script dependency with inline content
 */
export type ScriptInlineDependency = BaseDependency &
  InlinedDependency & {
    kind: 'script';
    source: 'inline';
    position?: DependencyPosition;
    minify?: boolean;
  };

/**
 * This interface represents a script dependency with a src URL
 */
export type ScriptSrcDependency = BaseDependency & {
  kind: 'script';
  source: 'url';
  position: DependencyPosition;
  minify?: boolean;
  srcUrl: string;
};

/**
 * This interface represents a script dependency with a src URL that's already bundled
 */
export type ScriptSrcDependencyPreBundled = BaseDependency & {
  kind: 'script';
  source: 'url';
  position: DependencyPosition;
  srcUrl: string;
  preBundled: true;
};

/**
 * This interface represents a script dependency from node_modules
 */
export type ScriptNodeModuleDependency = BaseDependency & {
  kind: 'script';
  source: 'nodeModule';
  position: DependencyPosition;
  minify?: boolean;
  importPath: string;
};

/**
 * This interface represents a script dependency with JSON content
 */
export type ScriptJsonDependency = BaseDependency & {
  content: string;
  source: 'json';
  position?: DependencyPosition;
};

/**
 * This interface represents a script dependency
 */
export type ScriptDependency =
  | ScriptInlineDependency
  | ScriptSrcDependency
  | ScriptJsonDependency
  | ScriptNodeModuleDependency
  | ScriptSrcDependencyPreBundled;

/**
 * This interface represents a stylesheet dependency with inline content
 */
export type StylesheetInlineDependency = BaseDependency &
  InlinedDependency & {
    kind: 'stylesheet';
    position: Extract<DependencyPosition, 'head'>;
  };

/**
 * This interface represents a stylesheet dependency with a src URL
 */
export type StylesheetSrcDependency = BaseDependency & {
  kind: 'stylesheet';
  position: Extract<DependencyPosition, 'head'>;
  srcUrl: string;
};

/**
 * This interface represents a stylesheet dependency with a src URL that's already bundled
 */
export type StylesheetSrcDependencyPreBundled = BaseDependency & {
  kind: 'stylesheet';
  position: Extract<DependencyPosition, 'head'>;
  srcUrl: string;
  preBundled: true;
};

/**
 * StylesheetDependency
 */
export type StylesheetDependency =
  | StylesheetInlineDependency
  | StylesheetSrcDependency
  | StylesheetSrcDependencyPreBundled;

/**
 * Available dependency types
 */
export type Dependency = ScriptDependency | StylesheetDependency;

/**
 * DependencyProvider
 * This interface represents a dependency provider that can provide dependencies
 */
export interface DependencyProvider {
  name: string;
  getDependencies(): Dependency[];
}

/**
 * ProcessedDependency
 * This interface represents a processed dependency that can be used to create the markup to inject
 */
export interface ProcessedDependency {
  provider: string;
  kind: DependencyKind;
  srcUrl: string;
  position?: DependencyPosition;
  filePath: string;
  inline: boolean;
  attributes?: Record<string, string>;
  content?: string;
}

/**
 * DependencyServiceOptions
 * This interface represents the options that the DependencyService accepts
 */
export interface DependencyServiceOptions {
  appConfig: EcoPagesAppConfig;
}

/**
 * DependencyService interface
 */
export interface IDependencyService {
  addProvider(provider: DependencyProvider): void;
  removeProvider(providerName: string): void;
  prepareDependencies(): Promise<ProcessedDependency[]>;
  hasProvider(providerName: string): boolean;
  getProviderDependencies(providerName: string): ProcessedDependency[];
}

/**
 * DependencyService is responsible for:
 * - Managing dependency providers
 * - Processing raw dependencies into processed ones
 * - Handling file operations (bundling, minification)
 * - Caching and optimization
 */
export class DependencyService implements IDependencyService {
  static readonly DEPS_DIR = '__dependencies__';

  private config: EcoPagesAppConfig;
  private providersMap = new Map<string, DependencyProvider>();
  private dependencies: ProcessedDependency[] = [];

  constructor({ appConfig }: DependencyServiceOptions) {
    this.config = appConfig;
  }

  /**
   * Add a dependency provider
   * @param provider
   */
  addProvider(provider: DependencyProvider): void {
    if (this.providersMap.has(provider.name)) {
      appLogger.error(`Dependency provider "${provider.name}" already exists. Skipping registration.`);
      return;
    }
    this.providersMap.set(provider.name, provider);
    appLogger.debug(`Dependency provider ${provider.name} added`);
  }

  /**
   * Remove a dependency provider
   * @param providerName
   */
  removeProvider(providerName: string): void {
    this.providersMap.delete(providerName);
  }

  /**
   * Check if a provider is already registered
   * @param providerName
   * @returns boolean
   */
  hasProvider(providerName: string): boolean {
    return this.providersMap.has(providerName);
  }

  /**
   * Get the dependencies of a provider
   * @param providerName
   * @returns {@link ProcessedDependency[]}
   */
  getProviderDependencies(providerName: string): ProcessedDependency[] {
    return this.dependencies.filter((dep) => dep.provider === providerName);
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
      DependencyService.DEPS_DIR,
      `${name}-${Math.random().toString(36).slice(2)}.${ext}`,
    );
    FileUtils.write(filepath, content);
    return { filepath };
  }

  private getSrcUrl(srcPath: string): string {
    const { distDir } = this.config;
    return srcPath.split(distDir)[1];
  }

  private async bundleScript({
    entrypoint,
    outdir,
    minify,
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
    });

    return build.outputs[0].path;
  }

  /**
   * This method is responsible for preparing the dependencies
   * It will process all the dependencies and write them to the dist directory
   * @returns {@link ProcessedDependency[]}
   */
  async prepareDependencies(): Promise<ProcessedDependency[]> {
    this.dependencies = [];

    for (const provider of this.providersMap.values()) {
      const deps = provider.getDependencies();
      await this.processDependencies(provider, deps);
    }

    await this.optimizeDependencies();

    return this.dependencies;
  }

  /**
   * This method is responsible for processing dependencies
   * This is where we inline the content of the dependencies and write them to the dist directory
   * @param provider {@link DependencyProvider}
   * @param deps {@link Dependency[]}
   */
  private async processDependencies(provider: DependencyProvider, deps: Dependency[]): Promise<void> {
    for (const dep of deps) {
      const depsDir = path.join(this.config.absolutePaths.distDir, DependencyService.DEPS_DIR);
      FileUtils.ensureDirectoryExists(depsDir);

      const result = await this.processDepFile(dep, provider, depsDir);

      const processedDep: ProcessedDependency = {
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

  private isInlineDependency(dep: Dependency): boolean {
    if ('inline' in dep) {
      return dep.inline === true;
    }
    return 'content' in dep;
  }

  private async processDepFile(
    dep: Dependency,
    provider: DependencyProvider,
    depsDir: string,
  ): Promise<{ filepath: string; content: string }> {
    try {
      let filepath: string;
      let content: string;

      if ('preBundled' in dep && dep.preBundled) {
        return {
          filepath: dep.srcUrl,
          content: '',
        };
      }

      switch (dep.source) {
        case 'nodeModule': {
          const nodeModuleDep = dep as ScriptNodeModuleDependency;
          const absolutePath = this.findNodeModuleDependency(nodeModuleDep.importPath);
          filepath = await this.bundleScript({
            entrypoint: absolutePath,
            outdir: depsDir,
            minify: nodeModuleDep.minify,
          });
          content = FileUtils.readFileSync(filepath, 'utf-8');
          break;
        }
        case 'url': {
          if (dep.kind === 'script') {
            const scriptDep = dep as ScriptSrcDependency;
            filepath = await this.bundleScript({
              entrypoint: scriptDep.srcUrl,
              outdir: depsDir,
              minify: scriptDep.minify,
            });
            content = FileUtils.readFileSync(filepath, 'utf-8');
          } else {
            const stylesheetDep = dep as StylesheetSrcDependency;
            const buffer = FileUtils.getFileAsBuffer(stylesheetDep.srcUrl);
            const result = this.writeFileToDist({
              content: buffer,
              name: provider.name,
              ext: 'css',
            });
            filepath = result.filepath;
            content = buffer.toString('utf-8');
          }
          break;
        }
        case 'inline': {
          const inlineDep = dep as ScriptInlineDependency;
          content = inlineDep.content;
          const result = this.writeFileToDist({
            content,
            name: provider.name,
            ext: dep.kind === 'script' ? 'js' : 'css',
          });
          filepath = result.filepath;
          break;
        }
        case 'json': {
          const jsonDep = dep as ScriptJsonDependency;
          // For JSON, we want to use the content directly without writing to a file
          return {
            filepath: '',
            content: jsonDep.content,
          };
        }
      }

      return { filepath, content };
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
      FileUtils.gzipDirSync(path.join(this.config.absolutePaths.distDir, DependencyService.DEPS_DIR), ['css', 'js']);
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
type CreateDependecy<T extends Dependency, U extends keyof T> = Partial<Pick<T, 'position'>> & Pick<T, U>;

/**
 * Helper class to create script and stylesheet dependencies
 */
export class DependencyHelpers {
  /**
   * Create a script dependency with inline content
   * @param options {@link ScriptDependency}
   * @returns
   */
  static createInlineScriptDependency = ({
    position = 'body',
    ...options
  }: CreateDependecy<ScriptInlineDependency, 'content' | 'attributes'>): ScriptDependency => {
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
   * @param options {@link ScriptDependency}
   * @returns
   */
  static createSrcScriptDependency = ({
    position = 'body',
    ...options
  }: CreateDependecy<ScriptSrcDependency, 'srcUrl' | 'attributes'>): ScriptDependency => {
    return {
      kind: 'script',
      source: 'url',
      position,
      ...options,
    };
  };

  static createNodeModuleScriptDependency = ({
    position = 'body',
    ...options
  }: CreateDependecy<ScriptNodeModuleDependency, 'importPath' | 'attributes'>): ScriptDependency => {
    return {
      kind: 'script',
      source: 'nodeModule',
      position,
      ...options,
    };
  };

  /**
   * Create a script dependency with a JSON content
   * @param options {@link ScriptJsonDependency}
   * @returns
   */
  static createJsonScriptDependency = ({
    attributes,
    position = 'body',
    ...options
  }: CreateDependecy<ScriptJsonDependency, 'content' | 'attributes'>): ScriptDependency => {
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
   * @param options {@link StylesheetInlineDependency}
   * @returns
   */
  static createInlineStylesheetDependency = ({
    ...options
  }: CreateDependecy<StylesheetInlineDependency, 'content' | 'attributes'>): StylesheetDependency => {
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
   * @param options {@link StylesheetSrcDependency}
   * @returns
   */
  static createSrcStylesheetDependency = ({
    position = 'head',
    ...options
  }: CreateDependecy<StylesheetSrcDependency, 'srcUrl' | 'attributes'>): StylesheetDependency => {
    return {
      kind: 'stylesheet',
      position,
      source: 'url',
      ...options,
    };
  };

  /**
   * Create a script dependency with a src URL that's already bundled
   * @param options {@link ScriptSrcDependencyPreBundled}
   * @returns
   */
  static createPreBundledScriptDependency = ({
    position = 'body',
    ...options
  }: CreateDependecy<ScriptSrcDependencyPreBundled, 'srcUrl' | 'attributes'>): ScriptSrcDependencyPreBundled => {
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
   * @param options {@link StylesheetSrcDependencyPreBundled}
   * @returns
   */
  static createPreBundledStylesheetDependency = ({
    position = 'head',
    ...options
  }: CreateDependecy<
    StylesheetSrcDependencyPreBundled,
    'srcUrl' | 'attributes'
  >): StylesheetSrcDependencyPreBundled => {
    return {
      kind: 'stylesheet',
      source: 'url',
      position,
      preBundled: true,
      ...options,
    };
  };
}
