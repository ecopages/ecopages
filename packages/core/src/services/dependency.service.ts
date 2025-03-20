import path from 'node:path';
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
 * BaseDependency, common attributes for all dependencies
 */
export interface BaseDependency {
  kind: DependencyKind;
  attributes?: Record<string, string>;
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
    position?: DependencyPosition;
    minify?: boolean;
  };

/**
 * This interface represents a script dependency with a src URL
 */
export type ScriptSrcDependency = BaseDependency & {
  kind: 'script';
  position: DependencyPosition;
  minify?: boolean;
  srcUrl: string;
};

/**
 * This interface represents a script dependency with JSON content
 */
export type ScriptJsonDependency = BaseDependency & {
  content: string;
  position?: DependencyPosition;
};

/**
 * This interface represents a script dependency
 */
export type ScriptDependency = ScriptInlineDependency | ScriptSrcDependency | ScriptJsonDependency;

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
 * StylesheetDependency
 */
export type StylesheetDependency = StylesheetInlineDependency | StylesheetSrcDependency;

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
  getDependencies(): ProcessedDependency[];
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
    this.providersMap.set(provider.name, provider);
  }

  /**
   * Remove a dependency provider
   * @param providerName
   */
  removeProvider(providerName: string): void {
    this.providersMap.delete(providerName);
  }

  /**
   * Get processed dependencies
   * @returns
   */
  getDependencies(): ProcessedDependency[] {
    return this.dependencies;
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
        srcUrl: this.getSrcUrl(result.filepath),
        attributes: dep.attributes,
        position: dep.position,
      };

      if (this.isInlineDependency(dep)) {
        processedDep.content = result.content;
      } else {
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

      if ('srcUrl' in dep) {
        if (dep.kind === 'script') {
          filepath = await this.bundleScript({
            entrypoint: dep.srcUrl as string,
            outdir: depsDir,
            minify: dep.minify,
          });
          content = FileUtils.readFileSync(filepath, 'utf-8');
        } else {
          const buffer = FileUtils.getFileAsBuffer(dep.srcUrl as string);
          const result = this.writeFileToDist({
            content: buffer,
            name: provider.name,
            ext: 'css',
          });
          filepath = result.filepath;
          content = buffer.toString('utf-8');
        }
      } else {
        content = dep.content as string;
        const result = this.writeFileToDist({
          content,
          name: provider.name,
          ext: dep.kind === 'script' ? 'js' : 'css',
        });
        filepath = result.filepath;
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
      ...options,
    };
  };
}
