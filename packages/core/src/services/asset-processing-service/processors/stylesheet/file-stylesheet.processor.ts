import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types';
import { BaseProcessor } from '../base/base-processor';

export class FileStylesheetProcessor extends BaseProcessor<FileStylesheetAsset> {
	getStyleContent = async (srcUrl: string): Promise<Buffer | string> => {
		try {
			const imported = await import(srcUrl).then((module) => module.default);
			if (typeof imported === 'string' && imported.endsWith('.css')) {
				return fileSystem.readFileSync(srcUrl);
			}
			return imported;
		} catch {
			return fileSystem.readFileSync(srcUrl);
		}
	};

	async process(dep: FileStylesheetAsset): Promise<ProcessedAsset> {
		const buffer = await this.getStyleContent(dep.filepath);
		const content = buffer.toString();
		const hash = this.generateHash(content);
		const cachekey = this.buildCacheKey(dep.filepath, hash, dep);

		return this.getOrProcess(cachekey, () => {
			const filepath = path.join(this.getAssetsDir(), path.relative(this.appConfig.srcDir, dep.filepath));

			if (!dep.inline) {
				fileSystem.ensureDir(path.dirname(filepath));
				fileSystem.write(filepath, buffer);
			}

			return {
				filepath: filepath,
				content: dep.inline ? buffer.toString() : undefined,
				kind: 'stylesheet',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
			};
		});
	}
}
