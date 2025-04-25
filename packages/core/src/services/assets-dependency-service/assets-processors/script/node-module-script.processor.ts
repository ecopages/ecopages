import path from 'node:path';
import { BaseScriptProcessor } from '../base/base-script-processor';
import type { EcoPagesAppConfig } from '../../../../internal-types';
import type { NodeModuleScriptAsset } from '../../assets.types';
import { FileUtils } from '../../../../utils/file-utils.module';

export class NodeModuleScriptProcessor extends BaseScriptProcessor<NodeModuleScriptAsset> {
  async process(dep: NodeModuleScriptAsset, key: string, config: EcoPagesAppConfig) {
    const modulePath = this.resolveModulePath(dep.importPath, config.rootDir);
    const hash = this.generateHash(key, modulePath);
    const filename = dep.name ? `${dep.name}` : `nodemodule-${hash}`;
    const filepath = this.getFilepath(filename);

    if (dep.inline) {
      const content = FileUtils.getFileAsBuffer(modulePath).toString();
      return {
        filepath,
        content,
        kind: dep.kind,
        position: dep.position,
        attributes: dep.attributes,
        inline: true,
      };
    }

    const filePath = await this.bundleScript({
      entrypoint: modulePath,
      outdir: this.getDistDir(),
      minify: this.isProduction,
      ...this.getBundlerOptions(dep),
    });

    return {
      filepath: filePath,
      srcUrl: filepath,
      kind: dep.kind,
      position: dep.position,
      attributes: dep.attributes,
      inline: dep.inline,
    };
  }

  private resolveModulePath(importPath: string, rootDir: string, maxDepth = 5): string {
    const tryPath = (dir: string): string => {
      const modulePath = path.join(dir, 'node_modules', importPath);
      if (FileUtils.existsSync(modulePath)) {
        return modulePath;
      }
      throw new Error(`Could not find module: ${importPath}`);
    };

    const findInParentDirs = (dir: string, depth: number): string => {
      try {
        return tryPath(dir);
      } catch (error) {
        if (depth === 0 || dir === path.parse(dir).root) {
          throw new Error(`Could not find module '${importPath}' in '${rootDir}' or its parent directories`);
        }
        return findInParentDirs(path.dirname(dir), depth - 1);
      }
    };

    return findInParentDirs(rootDir, maxDepth);
  }
}
