import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { BaseProcessor } from '../base/base-processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

export class ContentStylesheetProcessor extends BaseProcessor<ContentStylesheetAsset> {
	async process(dep: ContentStylesheetAsset): Promise<ProcessedAsset> {
		const virtualFilepath = path.join(this.appConfig.absolutePaths.distDir, 'styles', 'page-bundle.css');
		const processedContent = await applyStylesheetProcessors(this.appConfig, dep.content, virtualFilepath);
		const hash = this.generateHash(processedContent);
		const filename = `style-${hash}.css`;
		const cachekey = this.buildCacheKey(filename, hash, dep);

		return this.getOrProcess(cachekey, () => {
			const filepath = path.join(this.getAssetsDir(), 'styles', filename);

			if (!dep.inline) fileSystem.write(filepath, processedContent);

			return {
				filepath: dep.inline ? undefined : filepath,
				content: dep.inline ? processedContent : undefined,
				kind: 'stylesheet',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				packageRole: dep.packageRole,
				bundledSourceFilepaths: dep.bundledSourceFilepaths,
			};
		});
	}
}
