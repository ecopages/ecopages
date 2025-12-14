import path from 'node:path';
import { FileUtils } from '../../../../utils/file-utils.module';
import type { NodeModuleScriptAsset, ProcessedAsset } from '../../assets.types';
import { BaseScriptProcessor } from '../base/base-script-processor';
import { appLogger } from '../../../../global/app-logger';

export class NodeModuleScriptProcessor extends BaseScriptProcessor<NodeModuleScriptAsset> {
	async process(dep: NodeModuleScriptAsset) {
		const modulePath = this.resolveModulePath(dep.importPath, this.appConfig.rootDir);
		const moduleName = path.basename(modulePath);
		const hash = this.generateHash(modulePath);
		const filename = dep.name ? `${dep.name}` : `nm-${moduleName}-${hash}`;
		const cachekey = `${filename}:${hash}`;

		if (this.hasCacheFile(cachekey)) {
			return this.getCacheFile(cachekey) as ProcessedAsset;
		}

		if (dep.inline) {
			const content = FileUtils.getFileAsBuffer(modulePath).toString();
			const inlineProcessedAsset: ProcessedAsset = {
				content,
				kind: dep.kind,
				position: dep.position,
				attributes: dep.attributes,
				inline: true,
			};

			this.writeCacheFile(cachekey, inlineProcessedAsset);
			return inlineProcessedAsset;
		}

		const outdir = path.join(this.getAssetsDir(), 'vendors');

		const filePath = await this.bundleScript({
			entrypoint: modulePath,
			outdir: outdir,
			minify: this.isProduction,
			...this.getBundlerOptions(dep),
		});

		const processedAsset: ProcessedAsset = {
			filepath: filePath,
			kind: dep.kind,
			position: dep.position,
			attributes: dep.attributes,
			inline: dep.inline,
		};

		this.writeCacheFile(cachekey, processedAsset);

		return processedAsset;
	}

	private resolveModulePath(importPath: string, rootDir: string, maxDepth = 5): string {
		const tryPath = (dir: string): string => {
			const modulePath = path.join(dir, 'node_modules', importPath);
			if (FileUtils.existsSync(modulePath)) {
				return modulePath;
			}
			throw new Error(`Could not find module: ${importPath}`);
		};

		const findInParentDirs = (dir: string, depth: number): string => {
			try {
				return tryPath(dir);
			} catch (error) {
				appLogger.error(error as Error);
				if (depth === 0 || dir === path.parse(dir).root) {
					throw new Error(`Could not find module '${importPath}' in '${rootDir}' or its parent directories`);
				}
				return findInParentDirs(path.dirname(dir), depth - 1);
			}
		};

		return findInParentDirs(rootDir, maxDepth);
	}
}
