import path from 'node:path';
import { FileUtils } from '../../../../utils/file-utils.module';
import type { ContentScriptAsset, ProcessedAsset } from '../../assets.types';
import { BaseScriptProcessor } from '../base/base-script-processor';

export class ContentScriptProcessor extends BaseScriptProcessor<ContentScriptAsset> {
	async process(dep: ContentScriptAsset): Promise<ProcessedAsset> {
		const hash = this.generateHash(dep.content);
		const filename = dep.name ? `${dep.name}.js` : `script-${hash}.js`;
		const shouldBundle = this.shouldBundle(dep);

		const filepath = path.join(this.getAssetsDir(), 'scripts', filename);

		if (!shouldBundle) {
			if (!dep.inline) FileUtils.write(filepath, dep.content);
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
			const tempDir = path.join(this.appConfig.absolutePaths.distDir, 'scripts-temp');
			FileUtils.ensureDirectoryExists(tempDir);
			const tempFileName = path.join(tempDir, filename);
			FileUtils.ensureDirectoryExists(tempDir);
			FileUtils.write(tempFileName, dep.content);

			const bundledFilePath = await this.bundleScript({
				entrypoint: tempFileName,
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				...this.getBundlerOptions(dep),
			});

			const processedAsset: ProcessedAsset = {
				filepath,
				content: dep.inline ? FileUtils.readFileSync(bundledFilePath).toString() : undefined,
				srcUrl: bundledFilePath,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
			};

			FileUtils.rmdirSync(tempFileName);

			this.writeCacheFile(filename, processedAsset);

			return processedAsset;
		}

		throw new Error('No content found for script asset');
	}
}
