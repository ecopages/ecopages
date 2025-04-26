import path from 'node:path';
import { BaseScriptProcessor } from '../base/base-script-processor';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types';
import { FileUtils } from '../../../../utils/file-utils.module';
import { EXCLUDE_FROM_HTML_FLAG, RESOLVED_ASSETS_DIR } from '../../../../constants';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
  async process(dep: FileScriptAsset): Promise<ProcessedAsset> {
    const hash = this.generateHash(dep.filepath);
    const cachekey = `${dep.filepath}:${hash}`;

    if (this.hasCacheFile(cachekey)) {
      return this.getCacheFile(cachekey) as ProcessedAsset;
    }

    const shouldBundle = this.shouldBundle(dep);

    if (dep.filepath.endsWith(EXCLUDE_FROM_HTML_FLAG)) {
      dep.filepath = dep.filepath.replace(EXCLUDE_FROM_HTML_FLAG, '');
      dep.inline = true;
      dep.excludeFromHtml = true;
    }

    if (!shouldBundle) {
      const content = dep.inline ? FileUtils.readFileSync(dep.filepath, 'utf-8') : undefined;

      const outFilepath = path.relative(this.appConfig.srcDir, dep.filepath);
      let filepath: string | undefined = undefined;

      if (!dep.inline) {
        filepath = path.join(this.getAssetsDir(), outFilepath);
        FileUtils.copyFileSync(dep.filepath, filepath);
      }

      const unbundledProcessedAsset: ProcessedAsset = {
        filepath,
        content,
        kind: 'script',
        position: dep.position,
        attributes: dep.attributes,
        inline: dep.inline,
        excludeFromHtml: dep.excludeFromHtml,
      };

      this.writeCacheFile(cachekey, unbundledProcessedAsset);

      return unbundledProcessedAsset;
    }

    const relativeFilepath = path.relative(this.appConfig.srcDir, dep.filepath);
    const outdirPath = path.join(this.appConfig.distDir, RESOLVED_ASSETS_DIR, relativeFilepath);
    const outdirDirname = path.dirname(outdirPath);

    const bundledFilePath = await this.bundleScript({
      entrypoint: dep.filepath,
      outdir: outdirDirname,
      minify: this.isProduction,
      ...this.getBundlerOptions(dep),
    });

    const processedAsset: ProcessedAsset = {
      filepath: bundledFilePath,
      content: dep.inline ? FileUtils.readFileSync(bundledFilePath).toString() : undefined,
      srcUrl: bundledFilePath,
      kind: 'script',
      position: dep.position,
      attributes: dep.attributes,
      inline: dep.inline,
      excludeFromHtml: dep.excludeFromHtml,
    };

    this.writeCacheFile(cachekey, processedAsset);

    return processedAsset;
  }
}
