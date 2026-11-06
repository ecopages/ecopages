import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { assertBrowserOutputInsideDist, sourceRelativeBrowserAssetPath } from '../../../browser-asset-output.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseProcessor } from '../base/base-processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';
import { preparePackageStylesheet } from './package-stylesheet.ts';

/**
 * Processes a stylesheet file through the app's Processors and writes it under `dist/client/assets`.
 *
 * @remarks
 * A package stylesheet (`fromPackage`) skips Processors (see {@link preparePackageStylesheet}) and is always
 * written under its content hash, beside the files its `url()` references were emitted as.
 */
export class FileStylesheetProcessor extends BaseProcessor<FileStylesheetAsset> {
	getStyleContent = (srcUrl: string): Buffer => {
		return fileSystem.readFileAsBuffer(srcUrl);
	};

	async process(dep: FileStylesheetAsset): Promise<ProcessedAsset> {
		const directory = this.getAssetsDir();
		const processedContent = dep.fromPackage
			? preparePackageStylesheet(dep.filepath, directory)
			: await applyStylesheetProcessors(
					this.appConfig,
					this.getStyleContent(dep.filepath).toString(),
					dep.filepath,
				);
		let filepath: string | undefined;

		if (!dep.inline) {
			const relativePath = sourceRelativeBrowserAssetPath(this.appConfig.absolutePaths.srcDir, dep.filepath);

			if (this.isProduction || dep.fromPackage || !relativePath) {
				filepath = writeHashedBrowserAsset({
					bytes: processedContent,
					directory,
					extension: '.css',
				});
			} else {
				filepath = path.join(directory, relativePath);
				assertBrowserOutputInsideDist(this.appConfig.absolutePaths.distDir, filepath);
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
	}
}
