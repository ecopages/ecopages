import type { BaseProcessor } from './assets-processors/base/base-processor';
import type { AssetKind, AssetSource } from './assets.types';

export class ProcessorRegistry {
  private processors = new Map<`${AssetKind}-${AssetSource}`, BaseProcessor<any>>();

  register(kind: AssetKind, variant: AssetSource, processor: BaseProcessor<any>) {
    this.processors.set(`${kind}-${variant}`, processor);
  }

  getProcessor(kind: AssetKind, variant: AssetSource): BaseProcessor<any> | undefined {
    return this.processors.get(`${kind}-${variant}`);
  }

  getAllProcessors(): Map<`${AssetKind}-${AssetSource}`, BaseProcessor<any>> {
    return this.processors;
  }
}
