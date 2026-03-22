import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getAppBuildAdapter } from '../../../../../build/build-adapter.ts';
import type { NodeModuleScriptAsset } from '../../assets.types';
import { BaseScriptProcessor } from '../base/base-script-processor';

export class NodeModuleScriptProcessor extends BaseScriptProcessor<NodeModuleScriptAsset> {
	async process(dep: NodeModuleScriptAsset) {
		const modulePath = this.resolveModulePath(dep.importPath, this.appConfig.rootDir);
		const moduleName = path.basename(modulePath);
		const filename = dep.name ?? `nm-${moduleName}`;
		const configHash = this.generateHash(
			JSON.stringify({ inline: dep.inline, minify: !dep.inline && this.isProduction, opts: dep.bundleOptions }),
		);
		const cachekey = `${this.buildCacheKey(filename, this.generateHash(modulePath), dep)}:${configHash}`;

		return this.getOrProcess(cachekey, async () => {
			if (dep.inline) {
				const content = fileSystem.readFileAsBuffer(modulePath).toString();
				return {
					content,
					kind: dep.kind,
					position: dep.position,
					attributes: dep.attributes,
					inline: true,
					excludeFromHtml: dep.excludeFromHtml,
				};
			}

			const outdir = path.join(this.getAssetsDir(), 'vendors');
			const bundlerOptions = this.getBundlerOptions(dep);

			const filePath = await this.bundleScript({
				entrypoint: modulePath,
				outdir: outdir,
				minify: this.isProduction,
				naming: bundlerOptions.naming ?? (dep.name ? `${dep.name}-[hash].[ext]` : '[name]-[hash].[ext]'),
				...bundlerOptions,
			});

			return {
				filepath: filePath,
				kind: dep.kind,
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
				excludeFromHtml: dep.excludeFromHtml,
			};
		});
	}

	private resolveModulePath(importPath: string, rootDir: string): string {
		if (path.isAbsolute(importPath) && fileSystem.exists(importPath)) {
			return importPath;
		}

		try {
			return getAppBuildAdapter(this.appConfig).resolve(importPath, rootDir);
		} catch {
			return this.resolveModulePathFallback(importPath, rootDir);
		}
	}

	private resolveModulePathFallback(importPath: string, rootDir: string, maxDepth = 5): string {
		let currentDir = rootDir;
		let remainingDepth = maxDepth;

		while (remainingDepth >= 0) {
			const modulePath = path.join(currentDir, 'node_modules', importPath);
			if (fileSystem.exists(modulePath)) {
				return modulePath;
			}

			const parentDir = path.dirname(currentDir);
			if (parentDir === currentDir) {
				break;
			}

			currentDir = parentDir;
			remainingDepth -= 1;
		}

		throw new Error(`Could not resolve module '${importPath}' from '${rootDir}'`);
	}
}
