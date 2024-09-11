import path from 'node:path';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, IntegrationDependencyConfig } from '../internal-types.ts';
import type { IntegrationPlugin } from '../public-types.ts';
import { FileUtils } from '../utils/file-utils.module.ts';
import { invariant } from '../utils/invariant.ts';

export class IntegrationManager {
  static EXTERNAL_DEPS_DIR = '__integrations__';

  config: EcoPagesAppConfig;
  integrations: IntegrationPlugin[] = [];
  dependencies: IntegrationDependencyConfig[] = [];

  constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
    this.config = appConfig;
    this.integrations = appConfig.integrations;
  }

  private writeFileToDist({
    content,
    name,
    ext,
  }: {
    content: string | Buffer;
    name: string;
    ext: 'css' | 'js';
  }) {
    const filepath = path.join(
      this.config.rootDir,
      this.config.distDir,
      IntegrationManager.EXTERNAL_DEPS_DIR,
      `${name}-integration-${Math.random().toString(36).slice(2)}.${ext}`,
    );
    FileUtils.write(filepath, content);
    return {
      filepath,
    };
  }

  private getSrcUrl(srcPath: string) {
    const { distDir } = this.config;
    return srcPath.split(distDir)[1];
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

    invariant(maxDepth !== 0, `Could not find node_modules containing the file: ${importPath}`);
    return this.findAbsolutePathInNodeModules(importPath, parentDir, maxDepth - 1);
  }

  private findExternalDependencyInNodeModules(importPath: string) {
    let absolutePath = path.join(this.config.rootDir, 'node_modules', importPath);
    if (!FileUtils.existsSync(absolutePath)) {
      absolutePath = this.findAbsolutePathInNodeModules(importPath, this.config.rootDir, 5);
    }
    return absolutePath;
  }

  private async bundleExternalDependency({
    entrypoint,
    outdir,
    root,
  }: {
    entrypoint: string;
    outdir: string;
    root: string;
  }) {
    const build = await Bun.build({
      entrypoints: [entrypoint],
      outdir,
      root,
      target: 'browser',
      minify: true,
      format: 'esm',
      splitting: true,
      naming: '[name].[ext]',
    });

    return build;
  }

  private async prepareExternalDependency({
    importPath,
    name,
    kind,
  }: {
    importPath: string;
    name: string;
    kind: 'script' | 'stylesheet';
  }) {
    const absolutePath = this.findExternalDependencyInNodeModules(importPath);

    if (kind === 'script') {
      const bundle = await this.bundleExternalDependency({
        entrypoint: absolutePath,
        outdir: path.join(this.config.rootDir, this.config.distDir, IntegrationManager.EXTERNAL_DEPS_DIR),
        root: this.config.rootDir,
      });

      return { filepath: bundle.outputs[0].path };
    }

    const content = FileUtils.getFileAsBuffer(absolutePath);
    const file = this.writeFileToDist({ content, name, ext: 'css' });
    return file;
  }

  async prepareDependencies() {
    for (const integration of this.integrations) {
      if (integration.dependencies) {
        for (const dependency of integration.dependencies)
          switch (dependency.kind) {
            case 'script':
              {
                if ('importPath' in dependency) {
                  const { filepath } = await this.prepareExternalDependency({
                    importPath: dependency.importPath,
                    name: integration.name,
                    kind: dependency.kind,
                  });

                  this.dependencies.push({
                    integration: integration.name,
                    kind: dependency.kind,
                    srcUrl: this.getSrcUrl(filepath),
                    position: dependency.position ?? 'head',
                    filePath: filepath,
                    inline: dependency.inline ?? false,
                  });
                } else {
                  const { filepath } = this.writeFileToDist({
                    content: dependency.content,
                    name: integration.name,
                    ext: 'js',
                  });
                  this.dependencies.push({
                    integration: integration.name,
                    kind: dependency.kind,
                    srcUrl: this.getSrcUrl(filepath),
                    position: dependency.position ?? 'head',
                    filePath: filepath,
                    inline: dependency.inline ?? false,
                  });
                }
              }
              break;
            case 'stylesheet':
              {
                if ('importPath' in dependency) {
                  const { filepath } = await this.prepareExternalDependency({
                    importPath: dependency.importPath,
                    name: integration.name,
                    kind: dependency.kind,
                  });
                  this.dependencies.push({
                    integration: integration.name,
                    kind: dependency.kind,
                    srcUrl: this.getSrcUrl(filepath),
                    filePath: filepath,
                    inline: dependency.inline ?? false,
                  });
                } else {
                  const { filepath } = this.writeFileToDist({
                    content: dependency.content,
                    name: integration.name,
                    ext: 'css',
                  });
                  this.dependencies.push({
                    integration: integration.name,
                    kind: dependency.kind,
                    srcUrl: this.getSrcUrl(filepath),
                    filePath: filepath,
                    inline: dependency.inline ?? false,
                  });
                }
              }
              break;
          }
      }
    }

    appLogger.debug(
      `Integration Manager: Collected dependencies for ${this.integrations.length} integrations`,
      this.dependencies,
    );

    return this.dependencies;
  }
}
