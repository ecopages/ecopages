import path from 'node:path';
import { BaseProcessor } from './base-processor';
import type { ContentScriptAsset, ContentStylesheetAsset, ProcessedAsset, ScriptAsset } from '../assets.types';
import { FileUtils } from 'src/utils/file-utils.module';

export class ContentProcessor<
  T extends ContentScriptAsset | ContentStylesheetAsset = ContentScriptAsset | ContentStylesheetAsset,
> extends BaseProcessor<T> {
  async process(dep: T, key: string): Promise<ProcessedAsset> {
    const hash = this.generateHash(key, dep.content);
    const ext = this.getExtension(dep);
    const prefix = dep.kind === 'script' ? 'script' : 'style';
    const filename = dep.kind === 'script' && dep.name ? `${dep.name}.${ext}` : `${prefix}-${hash}.${ext}`;
    const outPath = this.getFilepath(filename);
    const shouldBundle = this.shouldBundle(dep);

    if (!shouldBundle) {
      if (!dep.inline) FileUtils.write(outPath, dep.content);

      return {
        filepath: outPath,
        content: dep.inline ? dep.content : undefined,
        kind: dep.kind,
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
        excludeFromHtml: (dep as ScriptAsset).excludeFromHtml,
      };
    }

    if (!dep.content) {
      const bundledFilePath = await this.bundleScript({
        entrypoint: dep.content,
        outdir: this.getDistDir(),
        minify: this.isProduction,
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

    if (dep.content) {
      const tempDir = 'temp';
      const tempFileName = path.join(tempDir, outPath);
      FileUtils.ensureDirectoryExists(tempDir);
      FileUtils.write(tempFileName, dep.content);

      const bundledFilePath = await this.bundleScript({
        entrypoint: dep.content,
        outdir: this.getDistDir(),
        minify: this.isProduction,
      });

      FileUtils.rmSync(tempDir, { recursive: true, force: true });

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

    throw new Error(`No content found for ${dep.kind} asset`);
  }
}
