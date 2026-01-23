import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../constants';
import { fileSystem } from '@ecopages/file-system';
import type { IHmrManager } from '../../../../internal-types';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types';
import { BaseScriptProcessor } from '../base/base-script-processor';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
	private hmrManager?: IHmrManager;

	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
	}

	async process(dep: FileScriptAsset): Promise<ProcessedAsset> {
		/**
		 * If HMR Manager is active, delegate build/watch to it.
		 */
		if (this.hmrManager?.isEnabled() && !dep.inline) {
			const outputUrl = await this.hmrManager.registerEntrypoint(dep.filepath);
			return {
				filepath: dep.filepath,
				srcUrl: outputUrl,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: false,
				excludeFromHtml: false,
			};
		}

		const content = fileSystem.readFileSync(dep.filepath);
		const hash = this.generateHash(content);
		const cachekey = `${dep.filepath}:${hash}`;

		if (this.hasCacheFile(cachekey)) {
			return this.getCacheFile(cachekey) as ProcessedAsset;
		}

		const shouldBundle = this.shouldBundle(dep);

		if (!shouldBundle) {
			const outFilepath = path.relative(this.appConfig.srcDir, dep.filepath);
			let filepath: string | undefined;

			if (!dep.inline) {
				filepath = path.join(this.getAssetsDir(), outFilepath);
				fileSystem.copyFile(dep.filepath, filepath);
			}

			const unbundledProcessedAsset: ProcessedAsset = {
				filepath,
				content,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
			};

			this.writeCacheFile(cachekey, unbundledProcessedAsset);

			return unbundledProcessedAsset;
		}

		const relativeFilepath = path.relative(this.appConfig.srcDir, dep.filepath);
		const outdirPath = path.join(this.appConfig.distDir, RESOLVED_ASSETS_DIR, relativeFilepath);
		const outdirDirname = path.dirname(outdirPath);

		const bundledFilePath = await this.bundleScript({
			entrypoint: dep.filepath,
			outdir: outdirDirname,
			minify: this.isProduction,
			...this.getBundlerOptions(dep),
		});

		const processedAsset: ProcessedAsset = {
			filepath: bundledFilePath,
			content: dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
			kind: 'script',
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
			excludeFromHtml: dep.excludeFromHtml,
		};

		this.writeCacheFile(cachekey, processedAsset);

		return processedAsset;
	}
}
