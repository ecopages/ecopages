import type { Plugin as EsbuildPlugin } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from './build-types.ts';
import type {
	BuildAdapter,
	BuildDependencyGraph,
	BuildLog,
	BuildOptions,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from './build-adapter.ts';
import {
	collectBrowserRuntimeImportRewriteMap,
	rewriteBrowserRuntimeImports,
} from './browser-runtime-import-rewrite-plugin.ts';
import { createEsbuildPluginBridge } from './esbuild-plugin-bridge.ts';

const moduleRequire = createRequire(import.meta.url);
const esbuildPath = moduleRequire.resolve('esbuild');
const workspaceNodePathsCache = new Map<string, string[]>();

/**
 * Provides common transpile output defaults shared across build profiles.
 */
function transpileProfileToOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	switch (profile) {
		case 'browser-script':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
		case 'hmr-runtime':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
		case 'hmr-entrypoint':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
	}
}

/**
 * Node build adapter backed by esbuild.
 *
 * This adapter keeps Ecopages build plugin compatibility (`onResolve`, `onLoad`,
 * and `module`) while delegating bundling and TypeScript/decorator transforms to esbuild.
 */
export const ESBUILD_ADAPTER_BRAND: unique symbol = Symbol.for('EsbuildBuildAdapter');

export class EsbuildBuildAdapter implements BuildAdapter {
	readonly ownership = 'bun-native' as const;
	readonly [ESBUILD_ADAPTER_BRAND] = true;

	private getJavaScriptOutExtension(options: BuildOptions): string | undefined {
		if (options.target === 'browser') {
			return undefined;
		}

		if (options.format === 'cjs') {
			return '.cjs';
		}

		if (options.format === 'esm') {
			return '.mjs';
		}

		return undefined;
	}

	private collectWorkspaceNodePaths(scanRoot: string, maxDepth = 3): string[] {
		const normalizedRoot = path.resolve(scanRoot);
		const cached = workspaceNodePathsCache.get(normalizedRoot);
		if (cached) {
			return cached;
		}

		const nodePaths = new Set<string>();
		const skippedDirectoryNames = new Set(['.git', '.turbo', 'dist', 'node_modules', 'test-results']);

		const visit = (dirPath: string, depth: number): void => {
			if (depth > maxDepth) {
				return;
			}

			const packageJsonPath = path.join(dirPath, 'package.json');
			const nodeModulesPath = path.join(dirPath, 'node_modules');

			if (fileSystem.exists(packageJsonPath) && fileSystem.exists(nodeModulesPath)) {
				nodePaths.add(nodeModulesPath);
			}

			if (depth === maxDepth) {
				return;
			}

			for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
				if (!entry.isDirectory()) {
					continue;
				}

				if (skippedDirectoryNames.has(entry.name) || entry.name.startsWith('.')) {
					continue;
				}

				visit(path.join(dirPath, entry.name), depth + 1);
			}
		};

		if (fileSystem.exists(normalizedRoot) && fileSystem.isDirectory(normalizedRoot)) {
			visit(normalizedRoot, 0);
		}

		const resolvedNodePaths = Array.from(nodePaths);
		workspaceNodePathsCache.set(normalizedRoot, resolvedNodePaths);
		return resolvedNodePaths;
	}

	private getFallbackNodePaths(contextRoot: string): string[] {
		const nodePaths = new Set<string>();

		const contextNodeModulesPath = path.join(contextRoot, 'node_modules');
		if (fileSystem.exists(contextNodeModulesPath)) {
			nodePaths.add(contextNodeModulesPath);
		}

		for (const workspaceNodePath of this.collectWorkspaceNodePaths(process.cwd())) {
			nodePaths.add(workspaceNodePath);
		}

		return Array.from(nodePaths);
	}

	private rewriteBrowserRuntimeImportsInOutputs(result: BuildResult, plugins: EcoBuildPlugin[]): BuildResult {
		if (!result.success || result.outputs.length === 0) {
			return result;
		}

		const specifierMap = collectBrowserRuntimeImportRewriteMap(plugins);
		if (specifierMap.size === 0) {
			return result;
		}

		for (const output of result.outputs) {
			if (!/\.(?:[cm]?js)$/u.test(output.path)) {
				continue;
			}

			const code = readFileSync(output.path, 'utf-8');
			const rewritten = rewriteBrowserRuntimeImports(code, specifierMap, output.path);

			if (rewritten !== code) {
				writeFileSync(output.path, rewritten);
			}
		}

		return result;
	}

	private getPluginsForBuild(additionalPlugins?: EcoBuildPlugin[]): EcoBuildPlugin[] {
		const byName = new Map<string, EcoBuildPlugin>();

		for (const plugin of additionalPlugins ?? []) {
			if (!byName.has(plugin.name)) {
				byName.set(plugin.name, plugin);
			}
		}

		return Array.from(byName.values());
	}

	private async loadEsbuildModule(moduleGeneration = 0): Promise<typeof import('esbuild')> {
		const importedModule = await import('esbuild');
		const esbuildModule = (
			typeof (importedModule as typeof import('esbuild')).build === 'function'
				? importedModule
				: ((importedModule as { default?: typeof import('esbuild') }).default ?? importedModule)
		) as typeof import('esbuild');

		if (moduleGeneration > 0 && !this.isMockedEsbuildModule(esbuildModule)) {
			const freshModule = await import(
				/* @vite-ignore */ `${pathToFileURL(esbuildPath).href}?ecopages_esbuild=${moduleGeneration}`
			);
			const normalizedFreshModule = (
				typeof (freshModule as typeof import('esbuild')).build === 'function'
					? freshModule
					: ((freshModule as { default?: typeof import('esbuild') }).default ?? freshModule)
			) as typeof import('esbuild');

			if (typeof normalizedFreshModule.build === 'function') {
				return normalizedFreshModule;
			}
		}

		if (typeof esbuildModule.build !== 'function') {
			throw new Error('esbuild is not available. Install esbuild to use Node bundling.');
		}

		return esbuildModule;
	}

	private isMockedEsbuildModule(esbuildModule: typeof import('esbuild')): boolean {
		const build = esbuildModule.build as { mock?: unknown } | undefined;
		const stop = esbuildModule.stop as { mock?: unknown } | undefined;
		return typeof build?.mock === 'object' || typeof stop?.mock === 'object';
	}

	/**
	 * Detects the subset of runtime faults that indicate esbuild's worker
	 * protocol is corrupted rather than a normal build error.
	 */
	isEsbuildProtocolError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		return ['Unexpected end of JSON input', 'Unexpected EOF', 'parseJSON', 'buildResponseToResult'].some(
			(fragment) => error.message.includes(fragment) || error.stack?.includes(fragment),
		);
	}

	async stopEsbuildService(moduleGeneration = 0): Promise<void> {
		const esbuild = await this.loadEsbuildModule(moduleGeneration);
		if (typeof esbuild.stop === 'function') {
			esbuild.stop();
		}
	}

	async buildOrThrow(options: BuildOptions, moduleGeneration = 0): Promise<BuildResult> {
		const esbuild = await this.loadEsbuildModule(moduleGeneration);
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const outdir = path.resolve(options.outdir ?? 'dist/assets');
		const tsconfigPath = path.join(contextRoot, 'tsconfig.json');
		const tsconfigExists = fileSystem.exists(tsconfigPath);
		const nodePaths = this.getFallbackNodePaths(contextRoot);

		const plugins = this.getPluginsForBuild(options.plugins);
		const esbuildPlugins: EsbuildPlugin[] = [
			...(plugins.length > 0 ? [createEsbuildPluginBridge(plugins, contextRoot)] : []),
		];
		const transpileTarget = 'es2022';

		const usesTemplatedNaming = this.hasTemplateTokens(options.naming);
		const outfile = options.naming && !usesTemplatedNaming ? path.join(outdir, options.naming) : undefined;
		if (outfile) {
			fileSystem.ensureDir(path.dirname(outfile));
		}

		const outputOptions = outfile
			? { outfile }
			: {
					outdir,
					...(options.outbase ? { outbase: path.resolve(options.outbase) } : {}),
					entryNames: usesTemplatedNaming ? this.toEntryNamePattern(options.naming) : '[name]',
					chunkNames: '[name]-[hash]',
					assetNames: '[name]-[hash]',
				};

		const result = await esbuild.build({
			absWorkingDir: contextRoot,
			...(nodePaths.length > 0 ? { nodePaths } : {}),
			entryPoints: options.entrypoints,
			bundle: options.bundle ?? true,
			...outputOptions,
			...(options.conditions ? { conditions: options.conditions } : {}),
			...(options.define ? { define: options.define } : {}),
			format: this.mapEsbuildFormat(options.format),
			platform: (options.target === 'browser' ? 'browser' : 'node') as 'browser' | 'node',
			sourcemap: this.mapEsbuildSourcemap(options.sourcemap),
			splitting: outfile ? false : !!options.splitting,
			minify: !!options.minify,
			...(typeof options.treeshaking === 'boolean' ? { treeShaking: options.treeshaking } : {}),
			external: options.external,
			...(options.target !== 'browser' && options.externalPackages !== false
				? { packages: 'external' as const }
				: {}),
			target: transpileTarget,
			...(this.getJavaScriptOutExtension(options)
				? { outExtension: { '.js': this.getJavaScriptOutExtension(options)! } }
				: {}),
			metafile: true,
			write: true,
			plugins: esbuildPlugins,
			jsx: 'automatic',
			tsconfig: tsconfigExists ? tsconfigPath : undefined,
			logLevel: 'silent',
		});

		const outputs = Object.keys(result.metafile.outputs).map((outputPath) => ({
			path: path.isAbsolute(outputPath) ? outputPath : path.join(contextRoot, outputPath),
		}));
		const logs = result.warnings.map((warning) => ({ message: warning.text }));
		const dependencyGraph = this.extractDependencyGraph(result.metafile, contextRoot);

		return this.rewriteBrowserRuntimeImportsInOutputs(
			{
				success: true,
				logs,
				outputs,
				dependencyGraph,
			},
			plugins,
		);
	}

	private mapEsbuildSourcemap(value: string | undefined): false | 'linked' | 'inline' | 'external' | 'both' {
		switch (value) {
			case 'none':
				return false;
			case 'inline':
				return 'inline';
			case 'both':
				return 'both';
			case 'external':
				return 'external';
			default:
				return 'linked';
		}
	}

	private mapEsbuildFormat(value: string | undefined): 'esm' | 'cjs' | 'iife' {
		switch (value) {
			case 'cjs':
				return 'cjs';
			case 'iife':
				return 'iife';
			default:
				return 'esm';
		}
	}

	private hasTemplateTokens(value: string | undefined): boolean {
		return typeof value === 'string' && /\[[^\]]+\]/.test(value);
	}

	private toEntryNamePattern(value: string | undefined): string {
		if (!value) {
			return '[name]';
		}

		const pattern = value.replaceAll(/\.?\[ext\]/g, '');
		return pattern.length > 0 ? pattern : '[name]';
	}

	private normalizeMetafilePath(value: string, contextRoot: string): string {
		if (path.isAbsolute(value)) {
			return path.normalize(value);
		}

		return path.normalize(path.resolve(contextRoot, value));
	}

	private extractDependencyGraph(
		metafile: {
			outputs: Record<string, { entryPoint?: string; inputs?: Record<string, unknown> }>;
		},
		contextRoot: string,
	): BuildDependencyGraph {
		const entrypoints = new Map<string, Set<string>>();

		for (const outputMeta of Object.values(metafile.outputs)) {
			if (!outputMeta.entryPoint) {
				continue;
			}

			const entrypointPath = this.normalizeMetafilePath(outputMeta.entryPoint, contextRoot);
			const dependencies = entrypoints.get(entrypointPath) ?? new Set<string>();
			dependencies.add(entrypointPath);

			for (const inputPath of Object.keys(outputMeta.inputs ?? {})) {
				dependencies.add(this.normalizeMetafilePath(inputPath, contextRoot));
			}

			entrypoints.set(entrypointPath, dependencies);
		}

		return {
			entrypoints: Object.fromEntries(
				Array.from(entrypoints.entries(), ([entrypointPath, dependencies]) => [
					entrypointPath,
					Array.from(dependencies),
				]),
			),
		};
	}

	/**
	 * Normalizes esbuild errors into Ecopages `BuildLog` entries.
	 */
	private toBuildLogs(error: unknown): BuildLog[] {
		if (error && typeof error === 'object') {
			const candidate = error as {
				errors?: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } }>;
				message?: string;
			};

			if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
				return candidate.errors.map((entry) => {
					const locationPrefix = entry.location?.file
						? `${entry.location.file}:${entry.location.line ?? 0}:${entry.location.column ?? 0} `
						: '';

					return {
						message: `${locationPrefix}${entry.text ?? 'Unknown esbuild error'}`,
					};
				});
			}

			if (typeof candidate.message === 'string') {
				return [{ message: candidate.message }];
			}
		}

		return [{ message: 'Unknown esbuild error' }];
	}

	createFailureResult(error: unknown): BuildResult {
		return {
			success: false,
			logs: this.toBuildLogs(error),
			outputs: [],
		};
	}

	/**
	 * Bundles entrypoints using esbuild for Node runtime builds.
	 */
	async build(options: BuildOptions): Promise<BuildResult> {
		try {
			return await this.buildOrThrow(options);
		} catch (error) {
			return this.createFailureResult(error);
		}
	}

	/**
	 * Resolves module specifiers from a project root.
	 */
	resolve(importPath: string, rootDir: string): string {
		return moduleRequire.resolve(importPath, { paths: [rootDir] });
	}

	/**
	 * Returns transpile defaults for a known transpile profile.
	 */
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}
