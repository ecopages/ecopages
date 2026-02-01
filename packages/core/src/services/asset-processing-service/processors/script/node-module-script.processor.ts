import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
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
				};
			}

			const outdir = path.join(this.getAssetsDir(), 'vendors');

			const filePath = await this.bundleScript({
				entrypoint: modulePath,
				outdir: outdir,
				minify: this.isProduction,
				naming: dep.name ? `${dep.name}.[ext]` : '[name].[ext]',
				...this.getBundlerOptions(dep),
			});

			return {
				filepath: filePath,
				kind: dep.kind,
				position: dep.position,
				attributes: dep.attributes,
				inline: dep.inline,
			};
		});
	}

	private resolveModulePath(importPath: string, rootDir: string): string {
		try {
			return Bun.resolveSync(importPath, rootDir);
		} catch {
			return this.resolveModulePathFallback(importPath, rootDir);
		}
	}

	private resolveModulePathFallback(importPath: string, rootDir: string, maxDepth = 5): string {
		const tryPath = (dir: string): string => {
			const modulePath = path.join(dir, 'node_modules', importPath);
			if (fileSystem.exists(modulePath)) {
				return modulePath;
			}
			throw new Error(`Could not find module: ${importPath}`);
		};

		const findInParentDirs = (dir: string, depth: number): string => {
			try {
				return tryPath(dir);
			} catch {
				if (depth === 0 || dir === path.parse(dir).root) {
					throw new Error(`Could not resolve module '${importPath}' from '${rootDir}'`);
				}
				return findInParentDirs(path.dirname(dir), depth - 1);
			}
		};

		return findInParentDirs(rootDir, maxDepth);
	}
}
