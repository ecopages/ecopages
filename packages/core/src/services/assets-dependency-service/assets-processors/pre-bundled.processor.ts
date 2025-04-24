import { BaseProcessor } from './base-processor';
import type { EcoPagesAppConfig } from '../../../internal-types';
import type { PreBundledScriptAsset, PreBundledStylesheetAsset } from '../assets.types';

export class PreBundledProcessor extends BaseProcessor<PreBundledScriptAsset | PreBundledStylesheetAsset> {
  async process(dep: PreBundledScriptAsset | PreBundledStylesheetAsset, key: string, config: EcoPagesAppConfig) {
    return {
      filepath: dep.filepath,
      kind: dep.kind,
      position: dep.position,
      attributes: dep.attributes,
      inline: false,
    };
  }
}
