import { BaseStylesheetProcessor } from '../base/base-stylesheet-processor';
import type { ContentStylesheetAsset, ProcessedAsset } from '../../assets.types';
import { FileUtils } from 'src/utils/file-utils.module';

export class ContentStylesheetProcessor extends BaseStylesheetProcessor<ContentStylesheetAsset> {
  async process(dep: ContentStylesheetAsset): Promise<ProcessedAsset> {
    const hash = this.generateHash(dep.content);
    const filename = `style-${hash}.css`;
    const outPath = this.getFilepath(filename);

    if (!dep.inline) {
      FileUtils.write(outPath, dep.content);
    }

    return {
      filepath: outPath,
      content: dep.inline ? dep.content : undefined,
      kind: 'stylesheet',
      position: dep.position,
      attributes: dep.attributes,
      inline: dep.inline,
    };
  }
}
