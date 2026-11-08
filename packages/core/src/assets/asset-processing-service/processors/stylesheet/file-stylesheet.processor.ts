import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import type { FileStylesheetAsset, ProcessedAsset } from '../../assets.types.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseProcessor } from '../base/base-processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';
import {
	emitStylesheetReferences,
	preparePackageStylesheet,
	type StylesheetReferenceOutput,
} from './package-stylesheet.ts';
import { type SourceRelativeStylesheetDirs, writeSourceRelativeStylesheet } from './source-relative-stylesheet.ts';

/**
 * Processes a stylesheet file through the app's Processors and writes it under `dist/client/assets`.
 *
 * @remarks
 * A package stylesheet (`fromPackage`) skips Processors (see {@link preparePackageStylesheet}) and is always
 * written under its content hash. The files any stylesheet's relative `url()` references name are emitted to
 * `dist/client/assets` under a content hash (see {@link emitStylesheetReferences}); a linked stylesheet names them
 * relative to where it is written, and an inline one root-relative, since a `<style>` resolves against the Page. In
 * development a stylesheet inside `srcDir` keeps its source-relative path (see {@link writeSourceRelativeStylesheet}).
 * The stylesheets the Processor inlined join `bundledSourceFilepaths`, so an edit to an `@import` partial evicts the
 * cached asset and the Pages that link it.
 */
export class FileStylesheetProcessor extends BaseProcessor<FileStylesheetAsset> {
	getStyleContent = (srcUrl: string): Buffer => {
		return fileSystem.readFileAsBuffer(srcUrl);
	};

	async process(dep: FileStylesheetAsset): Promise<ProcessedAsset> {
		const directory = this.getAssetsDir();
		const distDir = this.appConfig.absolutePaths.distDir;
		const output: StylesheetReferenceOutput = {
			assetsDir: directory,
			toReference: (emitted) =>
				dep.inline ? `/${path.relative(distDir, emitted)}` : path.relative(directory, emitted),
		};

		if (dep.fromPackage) return this.toProcessedAsset(dep, preparePackageStylesheet(dep.filepath, output));

		const { css, dependencies } = await applyStylesheetProcessors(
			this.appConfig,
			this.getStyleContent(dep.filepath).toString(),
			dep.filepath,
		);
		const processed =
			dependencies.length > 0
				? { ...dep, bundledSourceFilepaths: [...(dep.bundledSourceFilepaths ?? []), ...dependencies] }
				: dep;
		const sourceRelativePath =
			dep.inline || this.isProduction
				? undefined
				: writeSourceRelativeStylesheet(this.appDirs(), dep.filepath, css);
		if (sourceRelativePath) return this.toProcessedAsset(processed, undefined, sourceRelativePath);

		return this.toProcessedAsset(processed, emitStylesheetReferences(css, dep.filepath, output));
	}

	private appDirs(): SourceRelativeStylesheetDirs {
		const { distDir, srcDir } = this.appConfig.absolutePaths;
		return { srcDir, distDir };
	}

	/** Writes `content` under its content hash unless the stylesheet is inline or already written at `filepath`. */
	private toProcessedAsset(dep: FileStylesheetAsset, content: string | undefined, filepath?: string): ProcessedAsset {
		const output =
			filepath ??
			(dep.inline || content === undefined
				? undefined
				: writeHashedBrowserAsset({ bytes: content, directory: this.getAssetsDir(), extension: '.css' }));

		return {
			filepath: output,
			sourceFilepath: dep.filepath,
			content: dep.inline ? content : undefined,
			kind: 'stylesheet',
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
			packageRole: dep.packageRole,
			bundledSourceFilepaths: dep.bundledSourceFilepaths,
		};
	}
}
