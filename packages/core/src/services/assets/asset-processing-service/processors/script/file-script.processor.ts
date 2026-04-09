import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../../config/constants.ts';
import { fileSystem } from '@ecopages/file-system';
import type { IHmrManager } from '../../../../../types/internal-types.ts';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
	private hmrManager?: IHmrManager;

	private resolveHmrOutputFilepath(entrypointPath: string): string | undefined {
		if (!this.hmrManager || !('getDistDir' in this.hmrManager)) {
			return undefined;
		}

		const getDistDir = this.hmrManager.getDistDir;
		if (typeof getDistDir !== 'function') {
			return undefined;
		}

		const relativePathJs = path
			.relative(this.appConfig.absolutePaths.srcDir, entrypointPath)
			.replace(/\.(tsx?|jsx?|mdx?)$/, '.js')
			.replace(/\[([^\]]+)\]/g, '_$1_');

		return path.join(getDistDir.call(this.hmrManager), relativePathJs);
	}

	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
	}

	async process(dep: FileScriptAsset): Promise<ProcessedAsset> {
		/**
		 * If HMR Manager is active, delegate build/watch to it.
		 */
		if (this.hmrManager?.isEnabled() && !dep.inline) {
			const outputUrl = await this.hmrManager.registerScriptEntrypoint(dep.filepath);
			const outputFilepath = this.resolveHmrOutputFilepath(dep.filepath);
			return {
				filepath: outputFilepath ?? dep.filepath,
				srcUrl: outputUrl,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: false,
				excludeFromHtml: dep.excludeFromHtml,
			};
		}

		const content = fileSystem.readFileSync(dep.filepath);
		const shouldBundle = this.shouldBundle(dep);
		const configHash = this.generateHash(
			JSON.stringify({
				bundle: shouldBundle,
				minify: shouldBundle && this.isProduction,
				opts: dep.bundleOptions,
			}),
		);
		const cachekey = `${this.buildCacheKey(dep.filepath, this.generateHash(content), dep)}:${configHash}`;

		return this.getOrProcess(cachekey, async () => {
			if (!shouldBundle) {
				const outFilepath = path.relative(this.appConfig.absolutePaths.srcDir, dep.filepath);
				let filepath: string | undefined;

				if (!dep.inline) {
					filepath = path.join(this.getAssetsDir(), outFilepath);
					fileSystem.copyFile(dep.filepath, filepath);
				}

				return {
					filepath,
					content,
					kind: 'script',
					position: dep.position,
					attributes: dep.attributes,
					inline: dep.inline,
					excludeFromHtml: dep.excludeFromHtml,
				};
			}

			const relativeFilepath = path.relative(this.appConfig.absolutePaths.srcDir, dep.filepath);
			const outdirPath = path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR, relativeFilepath);
			const outdirDirname = path.dirname(outdirPath);
			const bundlerOptions = this.getBundlerOptions(dep);

			const bundledFilePath = await this.bundleScript({
				entrypoint: dep.filepath,
				outdir: outdirDirname,
				minify: this.isProduction,
				...bundlerOptions,
				plugins: bundlerOptions.plugins,
			});

			return {
				filepath: bundledFilePath,
				content: dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
			};
		});
	}
}
