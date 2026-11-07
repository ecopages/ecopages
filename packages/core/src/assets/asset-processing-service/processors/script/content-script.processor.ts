import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig, IHmrManager } from '../../../../config/internal-types.ts';
import type { ContentScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { resolveInlineContentScriptBody } from '../../inline-content-script-body.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';

export class ContentScriptProcessor extends BaseScriptProcessor<ContentScriptAsset> {
	private readonly getHmrManager: () => IHmrManager | undefined;

	constructor(options: { appConfig: EcoPagesAppConfig; getHmrManager?: () => IHmrManager | undefined }) {
		super(options);
		this.getHmrManager = options.getHmrManager ?? (() => undefined);
	}

	/**
	 * Returns the source of an unbundled script file as the browser should load it.
	 *
	 * @remarks
	 * With HMR active, a module script's imports are rewritten like a dev-transform module's, so a generated
	 * bootstrap can import a package by name and get the one vendor URL every other importer gets. This holds for an
	 * inline script too, whose body is the rewritten source. A script that is not a module, or HMR being off, keeps
	 * its source.
	 */
	private async resolveUnbundledScriptSource(dep: ContentScriptAsset, filepath: string): Promise<string> {
		const hmrManager = this.getHmrManager();
		if (!dep.content || dep.attributes?.type !== 'module' || !hmrManager?.isEnabled()) {
			return dep.content;
		}
		return hmrManager.rewriteModuleImports(dep.content, filepath);
	}

	private getContentScriptEntryDir(): string {
		const dir = path.join(this.appConfig.absolutePaths.workDir, 'content-script-entries');
		fileSystem.ensureDir(dir);
		return dir;
	}

	private getContentScriptEntryPath(): string {
		return path.join(this.getContentScriptEntryDir(), `${randomUUID()}.js`);
	}

	private toProcessedAsset(
		dep: ContentScriptAsset,
		filepath: string,
		inputPaths: readonly string[] = [],
		excludedEntrypoint?: string,
	): ProcessedAsset {
		return {
			filepath,
			content: resolveInlineContentScriptBody(dep, filepath),
			kind: 'script',
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
			excludeFromHtml: dep.excludeFromHtml,
			packageRole: dep.packageRole,
			groupedBundle: dep.groupedBundle,
			bundledSourceFilepaths: this.getBundledSourceFilepaths(
				dep,
				inputPaths,
				excludedEntrypoint ? [excludedEntrypoint] : [],
			),
		};
	}

	/**
	 * Bundles grouped content scripts from unique temp entry files.
	 *
	 * @remarks
	 * Each call writes its own UUID-named entry under `content-script-entries`.
	 * Concurrent same-content builds (theme-toggle islands on every kitchen-sink
	 * page) would otherwise share a hash-named file and delete it from under
	 * another in-flight Rolldown graph.
	 */
	async processGrouped(deps: ContentScriptAsset[]): Promise<ProcessedAsset[]> {
		const shouldBundle = deps.every((dep) => this.shouldBundle(dep));
		return this.processGroupedScripts(deps, {
			shouldBundleTogether: shouldBundle && deps.every((dep) => !dep.inline),
			prepareEntry: (dep) => {
				const contentHash = this.generateHash(dep.content);
				const tempFilepath = this.getContentScriptEntryPath();
				fileSystem.write(tempFilepath, dep.content);

				return {
					entryName: dep.groupedBundle?.entryName ?? dep.name ?? contentHash,
					entrypoint: tempFilepath,
					cleanup: () => fileSystem.remove(tempFilepath),
				};
			},
			toProcessedAsset: (dep, output, entrypoint) =>
				this.toProcessedAsset(dep, output.filepath, output.inputPaths, entrypoint),
		});
	}

	/**
	 * Emits one content script asset. Cache reuse is owned by {@link AssetProcessingService}.
	 */
	async process(dep: ContentScriptAsset): Promise<ProcessedAsset> {
		const shouldBundle = this.shouldBundle(dep);
		const hash = this.generateHash(dep.content);
		const filename = dep.name ? `${dep.name}.js` : `script-${hash}.js`;
		const filepath = path.join(this.getAssetsDir(), 'scripts', filename);

		if (!shouldBundle) {
			const unbundled = { ...dep, content: await this.resolveUnbundledScriptSource(dep, filepath) };
			if (!unbundled.inline) {
				fileSystem.write(filepath, unbundled.content);
			}

			return this.toProcessedAsset(unbundled, filepath);
		}

		if (!dep.content) {
			throw new Error('No content found for script asset');
		}

		const entryPath = this.getContentScriptEntryPath();
		fileSystem.write(entryPath, dep.content);

		try {
			const bundledOutput = await this.bundleScript({
				entrypoint: entryPath,
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				naming: `${path.parse(filename).name}-[hash].[ext]`,
				...this.getBundlerOptions(dep),
			});

			return this.toProcessedAsset(dep, bundledOutput.filepath, bundledOutput.inputPaths, entryPath);
		} finally {
			fileSystem.remove(entryPath);
		}
	}
}
