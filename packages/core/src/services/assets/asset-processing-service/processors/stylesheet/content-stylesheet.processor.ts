import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseProcessor } from '../base/base-processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

export class ContentStylesheetProcessor extends BaseProcessor<ContentStylesheetAsset> {
	async process(dep: ContentStylesheetAsset): Promise<ProcessedAsset> {
		const virtualFilepath =
			dep.processingOrigin ?? path.join(this.appConfig.absolutePaths.distDir, 'styles', 'page-bundle.css');
		const processedContent = await applyStylesheetProcessors(this.appConfig, dep.content, virtualFilepath);
		const hash = this.generateHash(processedContent);
		const cachekey = this.buildCacheKey(hash, hash, dep);

		return this.getOrProcess(cachekey, () => {
			let filepath: string | undefined;

			if (!dep.inline) {
				if (this.isProduction) {
					filepath = writeHashedBrowserAsset({
						bytes: processedContent,
						directory: this.getAssetsDir(),
						extension: '.css',
					});
				} else {
					filepath = path.join(this.getAssetsDir(), 'styles', `style-${hash}.css`);
					fileSystem.write(filepath, processedContent);
				}
			}

			return {
				filepath,
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
