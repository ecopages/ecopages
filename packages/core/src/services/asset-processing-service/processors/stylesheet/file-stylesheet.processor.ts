import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types';
import { BaseProcessor } from '../base/base-processor';

export class FileStylesheetProcessor extends BaseProcessor<FileStylesheetAsset> {
	private static readonly PROCESSABLE_STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

	getStyleContent = (srcUrl: string): Buffer => {
		return fileSystem.readFileAsBuffer(srcUrl);
	};

	private isProcessableStylesheet(filepath: string): boolean {
		return FileStylesheetProcessor.PROCESSABLE_STYLESHEET_EXTENSIONS.has(path.extname(filepath));
	}

	private async applyStylesheetProcessors(content: string, filepath: string): Promise<string> {
		if (!this.isProcessableStylesheet(filepath)) {
			return content;
		}

		let transformedContent = content;

		for (const processor of this.appConfig.processors.values()) {
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

	async process(dep: FileStylesheetAsset): Promise<ProcessedAsset> {
		const buffer = this.getStyleContent(dep.filepath);
		const rawContent = buffer.toString();
		const processedContent = await this.applyStylesheetProcessors(rawContent, dep.filepath);
		const hash = this.generateHash(processedContent);
		const cachekey = this.buildCacheKey(dep.filepath, hash, dep);

		return this.getOrProcess(cachekey, () => {
			const filepath = path.join(this.getAssetsDir(), path.relative(this.appConfig.srcDir, dep.filepath));
			const outputBuffer = Buffer.from(processedContent);

			if (!dep.inline) {
				fileSystem.ensureDir(path.dirname(filepath));
				fileSystem.write(filepath, outputBuffer);
			}

			return {
				filepath: filepath,
				content: dep.inline ? processedContent : undefined,
				kind: 'stylesheet',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
			};
		});
	}
}
