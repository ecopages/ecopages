import path from 'node:path';
import { BaseScriptProcessor } from '../base/base-script-processor';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types';
import { FileUtils } from '../../../../utils/file-utils.module';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
  async process(dep: FileScriptAsset, key: string): Promise<ProcessedAsset> {
    const hash = this.generateHash(key, dep.filepath);
    const filename = dep.name ? `${dep.name}.js` : `${this.getCleanAssetUrl(dep.filepath)}-${hash}.js`;
    const shouldBundle = this.shouldBundle(dep);

    if (!shouldBundle) {
      const content = dep.inline ? FileUtils.readFileSync(dep.filepath, 'utf-8') : undefined;

      if (!dep.inline) {
        FileUtils.copyFileSync(dep.filepath, filename);
      }

      return {
        filepath: filename,
        content,
        kind: 'script',
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
        excludeFromHtml: dep.excludeFromHtml,
      };
    }

    const outdir = path.join(this.getDistDir(), this.getCleanAssetUrl(dep.filepath));

    const bundledFilePath = await this.bundleScript({
      entrypoint: dep.filepath,
      outdir: path.dirname(outdir),
      minify: this.isProduction,
      ...this.getBundlerOptions(dep),
    });

    return {
      filepath: bundledFilePath,
      content: dep.inline ? FileUtils.readFileSync(bundledFilePath).toString() : undefined,
      srcUrl: bundledFilePath,
      kind: 'script',
      position: dep.position,
      attributes: dep.attributes,
      inline: dep.inline,
      excludeFromHtml: dep.excludeFromHtml,
    };
  }
}
