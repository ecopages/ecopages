import path from 'node:path';
import { rapidhash } from '../../../utils/hash';
import { BaseProcessor } from './base/base-processor';
import type { EcoPagesAppConfig } from '../../../internal-types';
import type { PreBundledScriptAsset, PreBundledStylesheetAsset } from '../assets.types';

export class PreBundledProcessor extends BaseProcessor<PreBundledScriptAsset | PreBundledStylesheetAsset> {
  async process(dep: PreBundledScriptAsset | PreBundledStylesheetAsset, key: string, config: EcoPagesAppConfig) {
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
