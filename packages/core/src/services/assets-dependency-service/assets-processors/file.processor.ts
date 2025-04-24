import { BaseProcessor } from './base-processor';
import type { FileScriptAsset, FileStylesheetAsset, ProcessedAsset, ScriptAsset } from '../assets.types';
import { FileUtils } from '../../../utils/file-utils.module';

export class FileProcessor extends BaseProcessor<FileScriptAsset | FileStylesheetAsset> {
  async process(dep: FileScriptAsset | FileStylesheetAsset, key: string): Promise<ProcessedAsset> {
    const hash = this.generateHash(key, dep.filepath);
    const ext = this.getExtension(dep);
    const prefix = dep.kind === 'script' ? 'script' : 'style';
    const filename = dep.kind === 'script' && dep.name ? `${dep.name}.${ext}` : `${prefix}-${hash}.${ext}`;
    const outPath = this.getFilepath(filename);

    if (ext === 'css') {
      const content = dep.inline ? FileUtils.readFileSync(dep.filepath, 'utf-8') : undefined;
      if (!dep.inline) {
        FileUtils.copyDirSync(dep.filepath, outPath);
      }
      return {
        filepath: outPath,
        content,
        kind: dep.kind,
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
      };
    }

    const shouldBundle = this.shouldBundle(dep);

    if (!shouldBundle) {
      const content = dep.inline ? FileUtils.readFileSync(dep.filepath, 'utf-8') : undefined;
      if (!dep.inline) {
        FileUtils.copyDirSync(dep.filepath, outPath);
      }
      return {
        filepath: outPath,
        content,
        kind: dep.kind,
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
        excludeFromHtml: (dep as ScriptAsset).excludeFromHtml,
      };
    }

    const bundledFilePath = await this.bundleScript({
      entrypoint: dep.filepath,
      outdir: this.getDistDir(),
      minify: this.isProduction,
      ...this.getBundlerOptions(dep),
    });

    return {
      filepath: outPath,
      content: dep.inline ? FileUtils.readFileSync(bundledFilePath).toString() : undefined,
      srcUrl: bundledFilePath,
      kind: dep.kind,
      position: dep.position,
      attributes: dep.attributes,
      inline: dep.inline,
      excludeFromHtml: (dep as ScriptAsset).excludeFromHtml,
    };
  }
}
