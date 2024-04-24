import path from 'node:path';
import { invariant } from '@/global/utils';
import { appLogger } from '@/utils/app-logger';
import { FileUtils } from '@/utils/file-utils.module';
import type { EcoPagesConfig, IntegrationPlugin } from '@types';

export class IntegrationManger {
  static EXTERNAL_DEPS_DIR = '_external';

  config: EcoPagesConfig;
  integrations: IntegrationPlugin[] = [];
  scripts: { position: 'head' | 'body'; filepath: string }[] = [];
  stylesheets: string[] = [];

  constructor({ config, integrations }: { config: EcoPagesConfig; integrations: IntegrationPlugin[] }) {
    this.config = config;
    this.integrations = integrations;
  }

  private addScriptToDist(content: string, name: string) {
    const filepath = path.join(
      this.config.rootDir,
      this.config.distDir,
      IntegrationManger.EXTERNAL_DEPS_DIR,
      `${name}-integration-${Date.now().toString(36)}.js`,
    );
    FileUtils.write(filepath, content);
    return {
      filepath,
    };
  }

  private prepareScript({ position, content, name }: { position: 'head' | 'body'; content: string; name: string }) {
    const { filepath } = this.addScriptToDist(content, name);
    this.scripts.push({ position, filepath });
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

  private async prepareExternalScript({
    position,
    importPath,
    name,
  }: { position: 'head' | 'body'; importPath: string; name: string }) {
    let absolutePath = path.join(this.config.rootDir, 'node_modules', importPath);
    if (!FileUtils.existsSync(absolutePath)) {
      absolutePath = this.findAbsolutePathInNodeModules(importPath, this.config.rootDir, 3);
    }

    const content = await FileUtils.getPathAsString(absolutePath);
    const { filepath } = this.addScriptToDist(content, name);
    this.scripts.push({ position, filepath });
  }

  async prepareInjections() {
    for (const integration of this.integrations) {
      if (integration.scriptsToInject) {
        for (const script of integration.scriptsToInject) {
          this.prepareScript({ position: script.position ?? 'head', content: script.content, name: integration.name });
        }
      }

      if (integration.dependencies) {
        if (integration.dependencies.stylesheets) {
          for (const stylesheet of integration.dependencies.stylesheets) {
            this.stylesheets.push(stylesheet);
          }
        }
        if (integration.dependencies.scripts) {
          for (const script of integration.dependencies.scripts) {
            await this.prepareExternalScript({
              position: script.position ?? 'head',
              importPath: script.importPath,
              name: integration.name,
            });
          }
        }
      }
    }
    appLogger.debug(
      `Integration Manager: Prepared injections for ${this.integrations.length} integrations`,
      this.scripts,
      this.stylesheets,
    );
  }
}
