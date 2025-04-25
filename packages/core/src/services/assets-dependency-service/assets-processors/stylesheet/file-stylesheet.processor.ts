import path from 'node:path';
import { BaseStylesheetProcessor } from '../base/base-stylesheet-processor';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types';
import { FileUtils } from '../../../../utils/file-utils.module';

export class FileStylesheetProcessor extends BaseStylesheetProcessor<FileStylesheetAsset> {
  getStyleContent = async (srcUrl: string): Promise<Buffer | string> => {
    try {
      const imported = await import(srcUrl).then((module) => module.default);
      if (typeof imported === 'string' && imported.endsWith('.css')) {
        return FileUtils.readFileSync(srcUrl);
      }
      return imported;
    } catch (error) {
      return FileUtils.readFileSync(srcUrl);
    }
  };

  async process(dep: FileStylesheetAsset, key: string): Promise<ProcessedAsset> {
    const hash = this.generateHash(key, dep.filepath);
    const { name } = path.parse(dep.filepath);
    const filename = `${name}-${hash}.css`;
    const outPath = this.getFilepath(filename);

    const buffer = await this.getStyleContent(dep.filepath);

    const filepath = this.writeAssetToFile({
      content: buffer,
      name: this.getCleanAssetUrl(dep.filepath),
      ext: 'css',
    });

    if (!dep.inline) {
      FileUtils.copyDirSync(dep.filepath, outPath);
    }

    return {
      filepath: filepath,
      content: dep.inline ? buffer.toString() : undefined,
      kind: 'stylesheet',
      position: dep.position,
      attributes: dep.attributes,
      inline: dep.inline,
    };
  }
}
