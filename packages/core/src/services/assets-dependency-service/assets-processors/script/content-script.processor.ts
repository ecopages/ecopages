import path from 'node:path';
import { BaseScriptProcessor } from '../base/base-script-processor';
import type { ContentScriptAsset, ProcessedAsset } from '../../assets.types';
import { FileUtils } from 'src/utils/file-utils.module';

export class ContentScriptProcessor extends BaseScriptProcessor<ContentScriptAsset> {
  async process(dep: ContentScriptAsset, key: string): Promise<ProcessedAsset> {
    const hash = this.generateHash(key, dep.content);
    const filename = dep.name ? `${dep.name}.js` : `script-${hash}.js`;
    const outPath = this.getFilepath(filename);
    const shouldBundle = this.shouldBundle(dep);

    if (!shouldBundle) {
      if (!dep.inline) FileUtils.write(outPath, dep.content);
      return {
        filepath: outPath,
        content: dep.inline ? dep.content : undefined,
        kind: 'script',
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
        excludeFromHtml: dep.excludeFromHtml,
      };
    }

    if (dep.content) {
      const tempDir = 'temp';
      const tempFileName = path.join(tempDir, outPath);
      FileUtils.ensureDirectoryExists(tempDir);
      FileUtils.write(tempFileName, dep.content);

      const bundledFilePath = await this.bundleScript({
        entrypoint: tempFileName,
        outdir: this.getDistDir(),
        minify: this.isProduction,
        ...this.getBundlerOptions(dep),
      });

      FileUtils.rmSync(tempDir, { recursive: true, force: true });

      return {
        filepath: outPath,
        content: dep.inline ? FileUtils.readFileSync(bundledFilePath).toString() : undefined,
        srcUrl: bundledFilePath,
        kind: 'script',
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
        excludeFromHtml: dep.excludeFromHtml,
      };
    }

    throw new Error('No content found for script asset');
  }
}
