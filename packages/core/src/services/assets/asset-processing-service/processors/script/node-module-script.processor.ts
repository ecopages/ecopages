import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { getAppBuildAdapter } from '../../../../../build/build-adapter.ts';
import type { NodeModuleScriptAsset } from '../../assets.types.ts';
import { BaseScriptProcessor } from '../base/base-script-processor.ts';

/**
 * Processes browser script assets whose entrypoint is referenced by package specifier.
 *
 * @remarks
 * Resolution stays app-boundary-first: prefer the active build adapter, then fall back
 * to ESM export-map resolution, and only then probe a small set of literal file paths.
 */
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
					packageRole: dep.packageRole,
					bundledSourceFilepaths: dep.bundledSourceFilepaths,
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
				packageRole: dep.packageRole,
				bundledSourceFilepaths: dep.bundledSourceFilepaths,
			};
		});
	}

	/**
	 * Resolves a node-module script entry from the current app boundary.
	 *
	 * @remarks
	 * The build adapter remains the primary resolution surface because Bun/native
	 * host-owned builds may have a more accurate view of aliases and package
	 * ownership than core does. The local fallback only runs when that adapter
	 * resolution is unavailable.
	 */
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

	/**
	 * Resolves browser-owned script specifiers without relying on CommonJS resolution.
	 *
	 * @remarks
	 * This path intentionally stays ESM-first because these assets are emitted as
	 * browser scripts. We first ask Node's ESM resolver to evaluate the package
	 * export map from the app boundary. If that still fails, we fall back to a
	 * bounded filesystem probe so direct file installs and package subpaths like
	 * `pkg/client/entry` still resolve when the export map does not cover them.
	 */
	private resolveModulePathFallback(importPath: string, rootDir: string, maxDepth = 5): string {
		try {
			return fileURLToPath(import.meta.resolve(importPath, pathToFileURL(path.join(rootDir, 'package.json')).href));
		} catch {}

		let currentDir = rootDir;
		let remainingDepth = maxDepth;

		while (remainingDepth >= 0) {
			for (const candidatePath of this.getFallbackCandidatePaths(currentDir, importPath)) {
				if (fileSystem.exists(candidatePath)) {
					return candidatePath;
				}
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

	/**
	 * Returns the file candidates we accept during the final literal filesystem probe.
	 *
	 * @remarks
	 * This is intentionally small and browser-entry-oriented: direct files, common
	 * JS extensions, and `index.*` entrypoints. If a package needs anything more
	 * exotic, it should resolve through the adapter or ESM export-map path above.
	 */
	private getFallbackCandidatePaths(rootDir: string, importPath: string): string[] {
		const moduleBasePath = path.join(rootDir, 'node_modules', importPath);

		return [
			moduleBasePath,
			`${moduleBasePath}.js`,
			`${moduleBasePath}.mjs`,
			`${moduleBasePath}.cjs`,
			path.join(moduleBasePath, 'index.js'),
			path.join(moduleBasePath, 'index.mjs'),
			path.join(moduleBasePath, 'index.cjs'),
		];
	}
}
