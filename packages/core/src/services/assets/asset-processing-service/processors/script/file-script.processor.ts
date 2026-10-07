import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../../config/constants.ts';
import { fileSystem } from '@ecopages/file-system';
import type { IHmrManager } from '../../../../../types/internal-types.ts';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';
import { classicScriptOutputName, compileClassicScript } from './classic-script-compiler.ts';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
	private hmrManager?: IHmrManager;

	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
	}

	private toProcessedAsset(dep: FileScriptAsset, filepath: string): ProcessedAsset {
		return {
			filepath,
			sourceFilepath: dep.filepath,
			kind: 'script',
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
			excludeFromHtml: dep.excludeFromHtml,
			packageRole: dep.packageRole,
			groupedBundle: dep.groupedBundle,
			bundledSourceFilepaths: dep.bundledSourceFilepaths,
		};
	}

	/**
	 * Bundles grouped file-script entries in one multi-entry Rolldown build.
	 *
	 * @remarks
	 * Output paths come from the recorded build graph, not from predicted names.
	 * HMR, inline, and unbundled entries fall back to per-file processing.
	 */
	async processGrouped(deps: FileScriptAsset[]): Promise<ProcessedAsset[]> {
		if (deps.length === 0) {
			return [];
		}

		const hmrEnabled = this.hmrManager?.isEnabled() === true;
		const shouldBundle = deps.every((dep) => this.shouldBundle(dep));
		if (!shouldBundle || deps.some((dep) => dep.inline) || hmrEnabled) {
			return Promise.all(deps.map((dep) => this.process(dep)));
		}

		const outputPaths = await this.bundleScripts({
			...this.getGroupedBundlerOptions(deps),
			entries: deps.map((dep) => ({
				entryName: dep.groupedBundle?.entryName ?? dep.name ?? path.parse(dep.filepath).name,
				entrypoint: dep.filepath,
			})),
			outdir: this.getAssetsDir(),
			minify: this.isProduction,
			naming: '[name]-[hash].[ext]',
		});

		return deps.map((dep) => {
			const entryName = dep.groupedBundle?.entryName ?? dep.name ?? path.parse(dep.filepath).name;
			const bundledFilePath = outputPaths.get(entryName);
			if (!bundledFilePath) {
				throw new Error(`Missing grouped bundle output for ${entryName}`);
			}

			return this.toProcessedAsset(dep, bundledFilePath);
		});
	}

	private getGroupedBundlerOptions(deps: FileScriptAsset[]): Record<string, unknown> {
		const primaryDep = deps[0]!;
		const options = this.getBundlerOptions(primaryDep);

		if (deps.some((dep) => dep.bundleOptions?.splitting === false)) {
			return {
				...options,
				splitting: false,
			};
		}

		return options;
	}

	/**
	 * @remarks
	 * With HMR active, bundled scripts are built and watched by the HMR manager, which emits ES
	 * modules. In production, `bundle: false` scripts are written under a hash of their bytes.
	 * In development they are copied to their source-relative path so HMR can refresh them.
	 * `classic` scripts are compiled on their own as classic scripts. Vendor runtimes keep their
	 * stable names.
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
					if (dep.packageRole === 'runtime' || !this.isProduction) {
						filepath = path.join(this.getAssetsDir(), outFilepath);
						fileSystem.copyFile(dep.filepath, filepath);
					} else {
						filepath = writeHashedBrowserAsset({
							bytes: content,
							directory: this.getAssetsDir(),
							extension: path.extname(dep.filepath) || '.js',
						});
					}
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
