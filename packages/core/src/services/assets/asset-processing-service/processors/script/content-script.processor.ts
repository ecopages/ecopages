import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { shouldUseDevBrowserScriptCache } from '../../../../../build/dev-browser-script-cache.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';

export class ContentScriptProcessor extends BaseScriptProcessor<ContentScriptAsset> {
	private getContentScriptEntryDir(): string {
		const dir = path.join(this.appConfig.absolutePaths.workDir, 'content-script-entries');
		fileSystem.ensureDir(dir);
		return dir;
	}

	private getContentScriptEntryPath(contentHash: string): string {
		return path.join(this.getContentScriptEntryDir(), `${contentHash}.js`);
	}

	private toProcessedAsset(dep: ContentScriptAsset, filepath: string, inlineContent?: string): ProcessedAsset {
		return {
			filepath,
			content: dep.inline ? inlineContent : undefined,
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

	private removeContentScriptEntry(contentHash: string): void {
		if (shouldUseDevBrowserScriptCache()) {
			return;
		}

		fileSystem.remove(this.getContentScriptEntryPath(contentHash));
	}

	async processGrouped(deps: ContentScriptAsset[]): Promise<ProcessedAsset[]> {
		if (deps.length === 0) {
			return [];
		}

		const shouldBundle = deps.every((dep) => this.shouldBundle(dep));
		if (!shouldBundle || deps.some((dep) => dep.inline)) {
			return Promise.all(deps.map((dep) => this.process(dep)));
		}

		let tempEntries: Array<{ dep: ContentScriptAsset; contentHash: string; tempFilepath: string }> = [];

		try {
			tempEntries = deps.map((dep) => {
				const contentHash = this.generateHash(dep.content);
				const tempFilepath = this.getContentScriptEntryPath(contentHash);

				fileSystem.write(tempFilepath, dep.content);

				return {
					dep,
					contentHash,
					tempFilepath,
				};
			});

			const outputPaths = await this.bundleScripts({
				...this.getGroupedBundlerOptions(deps),
				entries: tempEntries.map(({ dep, contentHash, tempFilepath }) => ({
					entryName: dep.groupedBundle?.entryName ?? dep.name ?? contentHash,
					entrypoint: tempFilepath,
				})),
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				naming: '[name]-[hash].[ext]',
			});

			return tempEntries.map(({ dep, contentHash }) => {
				const entryName = dep.groupedBundle?.entryName ?? dep.name ?? contentHash;
				const bundledFilePath = outputPaths.get(entryName);
				if (!bundledFilePath) {
					throw new Error(`Missing grouped bundle output for ${entryName}`);
				}

				return this.toProcessedAsset(
					dep,
					bundledFilePath,
					dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
				);
			});
		} finally {
			for (const { contentHash } of tempEntries) {
				this.removeContentScriptEntry(contentHash);
			}
		}
	}

	private getGroupedBundlerOptions(deps: ContentScriptAsset[]): Record<string, unknown> {
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
	 * Emits one content script asset. Cache reuse is owned by {@link AssetProcessingService}.
	 */
	async process(dep: ContentScriptAsset): Promise<ProcessedAsset> {
		const shouldBundle = this.shouldBundle(dep);
		const hash = this.generateHash(dep.content);
		const filename = dep.name ? `${dep.name}.js` : `script-${hash}.js`;
		const filepath = path.join(this.getAssetsDir(), 'scripts', filename);

		if (!shouldBundle) {
			if (!dep.inline) {
				fileSystem.write(filepath, dep.content);
			}

			return this.toProcessedAsset(dep, filepath, dep.inline ? dep.content : undefined);
		}

		if (!dep.content) {
			throw new Error('No content found for script asset');
		}

		const entryPath = this.getContentScriptEntryPath(hash);
		fileSystem.write(entryPath, dep.content);

		try {
			const bundledFilePath = await this.bundleScript({
				entrypoint: entryPath,
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				naming: `${path.parse(filename).name}-[hash].[ext]`,
				...this.getBundlerOptions(dep),
			});

			return this.toProcessedAsset(
				dep,
				bundledFilePath,
				dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
			);
		} finally {
			this.removeContentScriptEntry(hash);
		}
	}
}
