import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ContentScriptAsset, ProcessedAsset } from '../../assets.types.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';

export class ContentScriptProcessor extends BaseScriptProcessor<ContentScriptAsset> {
	async processGrouped(deps: ContentScriptAsset[]): Promise<ProcessedAsset[]> {
		if (deps.length === 0) {
			return [];
		}

		const shouldBundle = deps.every((dep) => this.shouldBundle(dep));
		if (!shouldBundle || deps.some((dep) => dep.inline)) {
			return Promise.all(deps.map((dep) => this.process(dep)));
		}

		const tempDir = path.join(
			this.appConfig.absolutePaths.distDir,
			`grouped-script-entries-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		fileSystem.ensureDir(tempDir);

		try {
			const tempEntries = deps.map((dep, index) => {
				const entryName = dep.groupedBundle?.entryName ?? dep.name ?? `grouped-script-${index}`;
				const tempFilepath = path.join(tempDir, `${entryName}.js`);

				fileSystem.write(tempFilepath, dep.content);

				return {
					dep,
					entryName,
					tempFilepath,
				};
			});

			const primaryDep = deps[0]!;
			const outputPaths = await this.bundleScripts({
				...this.getBundlerOptions(primaryDep),
				entries: tempEntries.map(({ entryName, tempFilepath }) => ({
					entryName,
					entrypoint: tempFilepath,
				})),
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				naming: '[name]-[hash].[ext]',
			});

			return tempEntries.map(({ dep, entryName }) => {
				const bundledFilePath = outputPaths.get(entryName);
				if (!bundledFilePath) {
					throw new Error(`Missing grouped bundle output for ${entryName}`);
				}

				return {
					filepath: bundledFilePath,
					content: dep.inline ? fileSystem.readFileSync(bundledFilePath).toString() : undefined,
					kind: 'script' as const,
					position: dep.position,
					attributes: dep.attributes,
					inline: dep.inline,
					excludeFromHtml: dep.excludeFromHtml,
					packageRole: dep.packageRole,
					groupedBundle: dep.groupedBundle,
					bundledSourceFilepaths: dep.bundledSourceFilepaths,
				};
			});
		} finally {
			fileSystem.remove(tempDir);
		}
	}

	async process(dep: ContentScriptAsset): Promise<ProcessedAsset> {
		const hash = this.generateHash(dep.content);
		const filename = dep.name ? `${dep.name}.js` : `script-${hash}.js`;
		const shouldBundle = this.shouldBundle(dep);

		const filepath = path.join(this.getAssetsDir(), 'scripts', filename);

		if (!shouldBundle) {
			if (!dep.inline) fileSystem.write(filepath, dep.content);
			const unbundledProcessedAsset: ProcessedAsset = {
				filepath,
				content: dep.inline ? dep.content : undefined,
				kind: 'script',
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
				packageRole: dep.packageRole,
				bundledSourceFilepaths: dep.bundledSourceFilepaths,
			};

			this.writeCacheFile(filename, unbundledProcessedAsset);
			return unbundledProcessedAsset;
		}

		if (dep.content) {
			const tempDir = this.appConfig.absolutePaths.distDir;
			fileSystem.ensureDir(tempDir);
			const tempFileName = path.join(
				tempDir,
				`${path.parse(filename).name}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp.js`,
			);
			fileSystem.write(tempFileName, dep.content);

			const bundledFilePath = await this.bundleScript({
				entrypoint: tempFileName,
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				naming: `${path.parse(filename).name}-[hash].[ext]`,
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
				packageRole: dep.packageRole,
				groupedBundle: dep.groupedBundle,
				bundledSourceFilepaths: dep.bundledSourceFilepaths,
			};

			fileSystem.remove(tempFileName);

			this.writeCacheFile(filename, processedAsset);

			return processedAsset;
		}

		throw new Error('No content found for script asset');
	}
}
