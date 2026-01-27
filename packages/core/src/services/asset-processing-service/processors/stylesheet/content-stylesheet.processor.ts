import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentStylesheetAsset, ProcessedAsset } from '../../assets.types';
import { BaseProcessor } from '../base/base-processor';

export class ContentStylesheetProcessor extends BaseProcessor<ContentStylesheetAsset> {
	async process(dep: ContentStylesheetAsset): Promise<ProcessedAsset> {
		const hash = this.generateHash(dep.content);
		const filename = `style-${hash}.css`;
		const cachekey = this.buildCacheKey(filename, hash, dep);

		if (this.hasCacheFile(cachekey)) {
			return this.getCacheFile(cachekey) as ProcessedAsset;
		}

		const filepath = path.join(this.getAssetsDir(), 'styles', filename);

		if (!dep.inline) fileSystem.write(filepath, dep.content);

		const processedAsset: ProcessedAsset = {
			filepath: dep.inline ? undefined : filepath,
			content: dep.inline ? dep.content : undefined,
			kind: 'stylesheet',
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
		};

		this.writeCacheFile(cachekey, processedAsset);

		return processedAsset;
	}
}
