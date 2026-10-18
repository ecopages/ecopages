import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../../constants.ts';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig, IHmrManager } from '../../../../../types/internal-types.ts';
import type { FileScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { writeHashedBrowserAsset } from '../../../hashed-browser-asset.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';
import { classicScriptOutputName, compileClassicScript } from './classic-script-compiler.ts';

export class FileScriptProcessor extends BaseScriptProcessor<FileScriptAsset> {
	private readonly getHmrManager: () => IHmrManager | undefined;
	/** Source file of each classic script output, so `a.ts` and `a.js` cannot both become `a.js`. */
	private readonly classicScriptSources = new Map<string, string>();

	constructor(options: { appConfig: EcoPagesAppConfig; getHmrManager: () => IHmrManager | undefined }) {
		super(options);
		this.getHmrManager = options.getHmrManager;
	}

	private getActiveHmrManager(): IHmrManager | undefined {
		return this.getHmrManager();
	}

	private toProcessedAsset(
		dep: FileScriptAsset,
		filepath: string,
		inputPaths: readonly string[] = [],
	): ProcessedAsset {
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
			bundledSourceFilepaths: this.getBundledSourceFilepaths(dep, inputPaths),
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
		const hmrEnabled = this.getActiveHmrManager()?.isEnabled() === true;
		const shouldBundle = deps.every((dep) => this.shouldBundle(dep));
		return this.processGroupedScripts(deps, {
			shouldBundleTogether: shouldBundle && deps.every((dep) => !dep.inline) && !hmrEnabled,
			prepareEntry: (dep) => ({
				entryName: dep.groupedBundle?.entryName ?? dep.name ?? path.parse(dep.filepath).name,
				entrypoint: dep.filepath,
			}),
			toProcessedAsset: (dep, output) => this.toProcessedAsset(dep, output.filepath, output.inputPaths),
		});
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
		const hmrManager = this.getActiveHmrManager();
		if (hmrManager?.isEnabled() && !dep.inline && this.shouldBundle(dep)) {
			return this.processWithHmr(dep, hmrManager);
		}

		const content = fileSystem.readFileSync(dep.filepath);
		if (!this.shouldBundle(dep)) {
			return this.processUnbundledScript(dep, content);
		}

		return this.processBundledScript(dep);
	}

	private async processWithHmr(dep: FileScriptAsset, hmrManager: IHmrManager): Promise<ProcessedAsset> {
		const resolvedOutput = hmrManager.getResolvedScriptOutput?.(dep.filepath);
		const output = resolvedOutput ?? (await hmrManager.registerScriptEntrypoint(dep.filepath));
		return {
			filepath: output.outputPath,
			sourceFilepath: dep.filepath,
			srcUrl: output.outputUrl,
			kind: 'script',
			position: dep.position,
			attributes: dep.attributes,
			inline: false,
			excludeFromHtml: dep.excludeFromHtml,
			packageRole: dep.packageRole,
			bundledSourceFilepaths: this.getBundledSourceFilepaths(dep),
		};
	}

	private processUnbundledScript(dep: FileScriptAsset, content: string): ProcessedAsset {
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
			bundledSourceFilepaths: this.getBundledSourceFilepaths(dep),
		};
	}

	private async processBundledScript(dep: FileScriptAsset): Promise<ProcessedAsset> {
		const relativeFilepath = path.relative(this.appConfig.absolutePaths.srcDir, dep.filepath);
		const outdirPath = path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR, relativeFilepath);
		const bundlerOptions = this.getBundlerOptions(dep);

		const bundledOutput = await this.bundleScript({
			entrypoint: dep.filepath,
			outdir: path.dirname(outdirPath),
			minify: this.isProduction,
			...bundlerOptions,
			plugins: bundlerOptions.plugins,
		});

		return {
			filepath: bundledOutput.filepath,
			sourceFilepath: dep.filepath,
			content: dep.inline ? fileSystem.readFileSync(bundledOutput.filepath).toString() : undefined,
			kind: 'script',
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
			excludeFromHtml: dep.excludeFromHtml,
			packageRole: dep.packageRole,
			bundledSourceFilepaths: this.getBundledSourceFilepaths(dep, bundledOutput.inputPaths),
		};
	}

	/**
	 * @remarks
	 * The output keeps the source path and name, with a TypeScript extension turned into `.js`, as a
	 * copied classic `.js` does. A second source file for the same output is rejected while the first
	 * still exists, so a last write cannot silently win.
	 *
	 * @throws When the file cannot be a classic script, or another existing file is emitted to its output.
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
		const other = this.classicScriptSources.get(filepath);
		if (other !== undefined && other !== dep.filepath && fileSystem.exists(other)) {
			throw new Error(`${dep.filepath} and ${other} are both emitted as ${filepath}. Rename one of them.`);
		}
		this.classicScriptSources.set(filepath, dep.filepath);
		fileSystem.write(filepath, compiled.code);
		return { code: compiled.code, filepath };
	}
}
