import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentScriptAsset, ProcessedAsset } from '../../assets.types';
import { BaseScriptProcessor } from '../base/base-script-processor';

export class ContentScriptProcessor extends BaseScriptProcessor<ContentScriptAsset> {
	async process(dep: ContentScriptAsset): Promise<ProcessedAsset> {
		const hash = this.generateHash(dep.content);
		const filename = dep.name ? `${dep.name}.js` : `script-${hash}.js`;
		const shouldBundle = this.shouldBundle(dep);

		const filepath = path.join(this.getAssetsDir(), 'scripts', filename);

		if (!shouldBundle) {
			if (!dep.inline) fileSystem.write(filepath, dep.content);
			const unbundledProcessedAsset: ProcessedAsset = {
				filepath,
				content: dep.inline ? dep.content : undefined,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
			};

			this.writeCacheFile(filename, unbundledProcessedAsset);
			return unbundledProcessedAsset;
		}

		if (dep.content) {
			const tempDir = this.appConfig.absolutePaths.distDir;
			fileSystem.ensureDir(tempDir);
			const tempFileName = path.join(tempDir, filename);
			fileSystem.write(tempFileName, dep.content);

			const bundledFilePath = await this.bundleScript({
				entrypoint: tempFileName,
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				...this.getBundlerOptions(dep),
			});

			const processedAsset: ProcessedAsset = {
				filepath,
				content: dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
				srcUrl: bundledFilePath,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
			};

			fileSystem.remove(tempFileName);

			this.writeCacheFile(filename, processedAsset);

			return processedAsset;
		}

		throw new Error('No content found for script asset');
	}
}
