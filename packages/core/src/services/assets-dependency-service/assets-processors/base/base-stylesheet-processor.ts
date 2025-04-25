import { BaseProcessor } from './base-processor';
import type { StylesheetAsset, ProcessedAsset } from '../../assets.types';

export abstract class BaseStylesheetProcessor<T extends StylesheetAsset> extends BaseProcessor<T> {
  protected getExtension(): string {
    return 'css';
  }
}
