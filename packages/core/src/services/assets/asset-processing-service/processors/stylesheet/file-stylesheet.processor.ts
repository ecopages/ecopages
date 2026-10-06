import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseProcessor } from '../base/base-processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

export class FileStylesheetProcessor extends BaseProcessor<FileStylesheetAsset> {
	getStyleContent = (srcUrl: string): Buffer => {
		return fileSystem.readFileAsBuffer(srcUrl);
	};

	async process(dep: FileStylesheetAsset): Promise<ProcessedAsset> {
		const buffer = this.getStyleContent(dep.filepath);
		const rawContent = buffer.toString();
		const processedContent = await applyStylesheetProcessors(this.appConfig, rawContent, dep.filepath);
		const hash = this.generateHash(processedContent);
		const cachekey = this.buildCacheKey(dep.filepath, hash, dep);

		return this.getOrProcess(cachekey, () => {
			let filepath: string | undefined;

			if (!dep.inline) {
				filepath = this.isProduction
					? writeHashedBrowserAsset({
							bytes: processedContent,
							directory: this.getAssetsDir(),
							extension: '.css',
						})
					: path.join(this.getAssetsDir(), path.relative(this.appConfig.absolutePaths.srcDir, dep.filepath));

				if (!this.isProduction) {
					fileSystem.ensureDir(path.dirname(filepath));
					fileSystem.write(filepath, processedContent);
				}
			}

			return {
				filepath,
				sourceFilepath: dep.filepath,
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
