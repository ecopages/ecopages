import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../../config/constants.ts';
import { fileSystem } from '@ecopages/file-system';
import type { IHmrManager } from '../../../../../types/internal-types.ts';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';
import { classicScriptOutputName, compileClassicScript } from './classic-script-compiler.ts';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
	private hmrManager?: IHmrManager;

	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
	}

	/**
	 * @remarks
	 * With HMR active, bundled scripts are built and watched by the HMR manager, which emits ES
	 * modules. `bundle: false` scripts are copied as written in every mode, and `classic` scripts are
	 * compiled on their own as classic scripts.
	 */
	async process(dep: FileScriptAsset): Promise<ProcessedAsset> {
		if (this.hmrManager?.isEnabled() && !dep.inline && this.shouldBundle(dep)) {
			const resolvedOutput = this.hmrManager.getResolvedScriptOutput?.(dep.filepath);
			if (resolvedOutput) {
				return {
					filepath: resolvedOutput.outputPath,
					sourceFilepath: dep.filepath,
					srcUrl: resolvedOutput.outputUrl,
					kind: 'script',
					position: dep.position,
					attributes: dep.attributes,
					inline: false,
					excludeFromHtml: dep.excludeFromHtml,
					packageRole: dep.packageRole,
					bundledSourceFilepaths: dep.bundledSourceFilepaths,
				};
			}

			const registered = await this.hmrManager.registerScriptEntrypoint(dep.filepath);
			return {
				filepath: registered.outputPath,
				sourceFilepath: dep.filepath,
				srcUrl: registered.outputUrl,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: false,
				excludeFromHtml: dep.excludeFromHtml,
				packageRole: dep.packageRole,
				bundledSourceFilepaths: dep.bundledSourceFilepaths,
			};
		}

		const content = fileSystem.readFileSync(dep.filepath);
		const shouldBundle = this.shouldBundle(dep);
		const configHash = this.generateHash(
			JSON.stringify({
				bundle: shouldBundle,
				classic: dep.classic === true,
				minify: (shouldBundle || dep.classic === true) && this.isProduction,
				opts: dep.bundleOptions,
			}),
		);
		const cachekey = `${this.buildCacheKey(dep.filepath, this.generateHash(content), dep)}:${configHash}`;

		return this.getOrProcess(cachekey, async () => {
			if (!shouldBundle) {
				const outFilepath = path.relative(this.appConfig.absolutePaths.srcDir, dep.filepath);
				const output = dep.classic ? this.emitClassicScript(dep, outFilepath, content.toString()) : undefined;
				let filepath = output?.filepath;

				if (!dep.classic && !dep.inline) {
					filepath = path.join(this.getAssetsDir(), outFilepath);
					fileSystem.copyFile(dep.filepath, filepath);
				}

				return {
					filepath,
					sourceFilepath: dep.filepath,
					content: output?.code ?? content,
					kind: 'script',
					position: dep.position,
					attributes: dep.attributes,
					inline: dep.inline,
					excludeFromHtml: dep.excludeFromHtml,
					packageRole: dep.packageRole,
					bundledSourceFilepaths: dep.bundledSourceFilepaths,
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
				sourceFilepath: dep.filepath,
				content: dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
				packageRole: dep.packageRole,
				bundledSourceFilepaths: dep.bundledSourceFilepaths,
			};
		});
	}

	/**
	 * @remarks
	 * The output keeps the source path and name, with a TypeScript extension turned into `.js`, as a
	 * copied classic `.js` does.
	 */
	private emitClassicScript(
		dep: FileScriptAsset,
		outFilepath: string,
		source: string,
	): { code: string; filepath?: string } {
		const compiled = compileClassicScript(dep.filepath, source, { minify: this.isProduction });
		if ('problem' in compiled) {
			throw new Error(`${dep.filepath} cannot be used as a classic script: it ${compiled.problem.reason}.`);
		}
		if (dep.inline) {
			return { code: compiled.code };
		}

		const filepath = path.join(this.getAssetsDir(), classicScriptOutputName(outFilepath));
		fileSystem.write(filepath, compiled.code);
		return { code: compiled.code, filepath };
	}
}
