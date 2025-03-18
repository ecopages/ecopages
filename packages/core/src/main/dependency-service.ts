import path from 'node:path';
import { deepMerge } from 'src/utils/deep-merge';
import type { EcoPagesAppConfig } from '../internal-types';
import { FileUtils } from '../utils/file-utils.module';

export type DependencyKind = 'script' | 'stylesheet';
export type DependencyPosition = 'head' | 'body';

export interface BaseDependency {
  kind: DependencyKind;
  attributes?: Record<string, string>;
}

type InlinedDependency = {
  inline: true;
  content: string;
};

export type ScriptInlineDependency = BaseDependency &
  InlinedDependency & {
    kind: 'script';
    position?: DependencyPosition;
    minify?: boolean;
  };

export type ScriptSrcDependency = BaseDependency & {
  kind: 'script';
  position: DependencyPosition;
  minify?: boolean;
  srcUrl: string;
};

export type ScriptJsonDependency = BaseDependency & {
  content: string;
  position?: DependencyPosition;
};

export type ScriptDependency = ScriptInlineDependency | ScriptSrcDependency | ScriptJsonDependency;

export type StylesheetInlineDependency = BaseDependency &
  InlinedDependency & {
    kind: 'stylesheet';
    position: Extract<DependencyPosition, 'head'>;
  };

export type StylesheetSrcDependency = BaseDependency & {
  kind: 'stylesheet';
  position: Extract<DependencyPosition, 'head'>;
  srcUrl: string;
};

export type StylesheetDependency = StylesheetInlineDependency | StylesheetSrcDependency;

export type Dependency = ScriptDependency | StylesheetDependency;

export interface DependencyProvider {
  name: string;
  getDependencies(): Dependency[];
}

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

export interface DependencyServiceOptions {
  appConfig: EcoPagesAppConfig;
}

export interface IDependencyService {
  addProvider(provider: DependencyProvider): void;
  removeProvider(providerName: string): void;
  prepareDependencies(): Promise<ProcessedDependency[]>;
  getDependencies(): ProcessedDependency[];
}

export class DependencyService implements IDependencyService {
  static readonly DEPS_DIR = '__dependencies__';

  private config: EcoPagesAppConfig;
  private providersMap = new Map<string, DependencyProvider>();
  private dependencies: ProcessedDependency[] = [];

  constructor({ appConfig }: DependencyServiceOptions) {
    this.config = appConfig;
  }

  addProvider(provider: DependencyProvider): void {
    this.providersMap.set(provider.name, provider);
  }

  removeProvider(providerName: string): void {
    this.providersMap.delete(providerName);
  }

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
  }

  private async optimizeDependencies(): Promise<void> {
    if (this.dependencies.length) {
      FileUtils.gzipDirSync(path.join(this.config.absolutePaths.distDir, DependencyService.DEPS_DIR), ['css', 'js']);
    }
  }
}

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
