import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { assertBrowserOutputInsideDist, sourceRelativeBrowserAssetPath } from '../../../browser-asset-output.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseProcessor } from '../base/base-processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';
import {
	emitStylesheetReferences,
	preparePackageStylesheet,
	type StylesheetReferenceOutput,
} from './package-stylesheet.ts';

/**
 * Processes a stylesheet file through the app's Processors and writes it under `dist/client/assets`.
 *
 * @remarks
 * A package stylesheet (`fromPackage`) skips Processors (see {@link preparePackageStylesheet}) and is always
 * written under its content hash. The files any stylesheet's relative `url()` references name are emitted to
 * `dist/client/assets` under a content hash (see {@link emitStylesheetReferences}); a linked stylesheet names them
 * relative to where it is written, and an inline one root-relative, since a `<style>` resolves against the Page.
 */
export class FileStylesheetProcessor extends BaseProcessor<FileStylesheetAsset> {
	getStyleContent = (srcUrl: string): Buffer => {
		return fileSystem.readFileAsBuffer(srcUrl);
	};

	async process(dep: FileStylesheetAsset): Promise<ProcessedAsset> {
		const directory = this.getAssetsDir();
		const distDir = this.appConfig.absolutePaths.distDir;
		const relativePath = sourceRelativeBrowserAssetPath(this.appConfig.absolutePaths.srcDir, dep.filepath);
		const sourceRelativeOutput =
			dep.inline || this.isProduction || dep.fromPackage || !relativePath
				? undefined
				: path.join(directory, relativePath);
		let referenceDir: string | undefined;
		if (!dep.inline) referenceDir = sourceRelativeOutput ? path.dirname(sourceRelativeOutput) : directory;
		const output: StylesheetReferenceOutput = {
			assetsDir: directory,
			toReference: (emitted) =>
				referenceDir
					? path.relative(referenceDir, emitted).split(path.sep).join('/')
					: `/${path.relative(distDir, emitted).split(path.sep).join('/')}`,
		};
		const processedContent = dep.fromPackage
			? preparePackageStylesheet(dep.filepath, output)
			: emitStylesheetReferences(
					await applyStylesheetProcessors(
						this.appConfig,
						this.getStyleContent(dep.filepath).toString(),
						dep.filepath,
					),
					dep.filepath,
					output,
				);
		let filepath: string | undefined;

		if (!dep.inline) {
			if (sourceRelativeOutput) {
				filepath = sourceRelativeOutput;
				assertBrowserOutputInsideDist(distDir, filepath);
				fileSystem.ensureDir(path.dirname(filepath));
				fileSystem.write(filepath, processedContent);
			} else {
				filepath = writeHashedBrowserAsset({
					bytes: processedContent,
					directory,
					extension: '.css',
				});
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
