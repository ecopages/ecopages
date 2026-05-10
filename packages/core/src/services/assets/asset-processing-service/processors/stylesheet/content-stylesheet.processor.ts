import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { BaseProcessor } from '../base/base-processor.ts';

export class ContentStylesheetProcessor extends BaseProcessor<ContentStylesheetAsset> {
	private static readonly PROCESSABLE_STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

	private isProcessableStylesheet(filepath: string): boolean {
		return ContentStylesheetProcessor.PROCESSABLE_STYLESHEET_EXTENSIONS.has(path.extname(filepath));
	}

	private async applyStylesheetProcessors(content: string, filepath: string): Promise<string> {
		if (!this.isProcessableStylesheet(filepath)) {
			return content;
		}

		let transformedContent = content;
		const processors = this.appConfig.processors ? Array.from(this.appConfig.processors.values()) : [];

		for (const processor of processors) {
			const hasCapabilities = processor.getAssetCapabilities().length > 0;
			const canProcessStylesheet = processor.canProcessAsset('stylesheet', filepath);

			if (!canProcessStylesheet && (hasCapabilities || !processor.getName().includes('postcss'))) {
				continue;
			}

			if (!processor.matchesFileFilter(filepath)) {
				continue;
			}

			const result = await processor.process(transformedContent, filepath);

			if (typeof result === 'string') {
				transformedContent = result;
				continue;
			}

			if (result instanceof Buffer) {
				transformedContent = result.toString();
			}
		}

		return transformedContent;
	}

	async process(dep: ContentStylesheetAsset): Promise<ProcessedAsset> {
		const virtualFilepath = path.join(this.appConfig.absolutePaths.distDir, 'styles', 'page-bundle.css');
		const processedContent = await this.applyStylesheetProcessors(dep.content, virtualFilepath);
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
