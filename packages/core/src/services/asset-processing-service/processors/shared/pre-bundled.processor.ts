import path from 'node:path';
import { rapidhash } from '../../../../utils/hash';
import type { PreBundledScriptAsset, PreBundledStylesheetAsset } from '../../assets.types';
import { BaseProcessor } from '../base/base-processor';

export class PreBundledProcessor extends BaseProcessor<PreBundledScriptAsset | PreBundledStylesheetAsset> {
  async process(dep: PreBundledScriptAsset | PreBundledStylesheetAsset) {
    const segments = dep.filepath.split(path.sep);
    const filename = segments.pop() || '';
    const hash = rapidhash(filename);
    const hashedFilename = `${path.parse(filename).name}-${hash}${path.parse(filename).ext}`;

    return {
      filepath: path.join(...segments, hashedFilename),
      kind: dep.kind,
      position: dep.position,
      attributes: dep.attributes,
      inline: false,
    };
  }
}
