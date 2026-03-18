import type {
	Loader as EsbuildLoader,
	OnLoadResult as EsbuildOnLoadResult,
	OnResolveResult as EsbuildOnResolveResult,
	Plugin as EsbuildPlugin,
} from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import type {
	EcoBuildOnLoadResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
	EcoBuildOnResolveResult,
} from './build-types.ts';
import type {
	BuildAdapter,
	BuildDependencyGraph,
	BuildLog,
	BuildOptions,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from './build-adapter.ts';

const esbuildRequire = createRequire(import.meta.url);

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
export class EsbuildBuildAdapter implements BuildAdapter {
	private registeredPlugins: EcoBuildPlugin[] = [];

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private getPluginsForBuild(additionalPlugins?: EcoBuildPlugin[]): EcoBuildPlugin[] {
		const merged = [...(additionalPlugins ?? []), ...this.registeredPlugins];
		const byName = new Map<string, EcoBuildPlugin>();

		for (const plugin of merged) {
			if (!byName.has(plugin.name)) {
				byName.set(plugin.name, plugin);
			}
		}

		return Array.from(byName.values());
	}

	private normalizeEsbuildLoader(loader: unknown): EsbuildLoader | undefined {
		switch (loader) {
			case 'base64':
			case 'binary':
			case 'copy':
			case 'css':
			case 'dataurl':
			case 'empty':
			case 'file':
			case 'global-css':
			case 'js':
			case 'json':
			case 'jsx':
			case 'local-css':
			case 'text':
			case 'ts':
			case 'tsx':
				return loader as EsbuildLoader;
			default:
				return undefined;
		}
	}

	private inferEsbuildLoaderFromPath(filePath: string): EsbuildLoader {
		const extension = path.extname(filePath).toLowerCase();

		switch (extension) {
			case '.ts':
				return 'ts';
			case '.tsx':
				return 'tsx';
			case '.jsx':
				return 'jsx';
			case '.json':
				return 'json';
			case '.css':
				return 'css';
			default:
				return 'js';
		}
	}

	private convertLoadResultToModuleSource(result: unknown): string | undefined {
		if (!result || typeof result !== 'object') {
			return undefined;
		}

		const candidate = result as {
			contents?: string;
			loader?: unknown;
			exports?: Record<string, unknown>;
		};

		if (typeof candidate.contents === 'string') {
			return candidate.contents;
		}

		if (candidate.loader === 'object' && candidate.exports && typeof candidate.exports === 'object') {
			const entries = Object.entries(candidate.exports)
				.map(([key, value]) =>
					key === 'default'
						? `export default ${JSON.stringify(value)};`
						: `export const ${key} = ${JSON.stringify(value)};`,
				)
				.join('\n');

			return entries;
		}

		return undefined;
	}

	private convertPluginOnLoadResult(args: { path: string }, result: unknown): EsbuildOnLoadResult | undefined {
		if (!result || typeof result !== 'object') {
			return undefined;
		}

		const candidate = result as EcoBuildOnLoadResult;

		const sourceFromExports =
			candidate.loader === 'object' && candidate.exports && typeof candidate.exports === 'object'
				? this.convertLoadResultToModuleSource(candidate)
				: undefined;

		if (sourceFromExports) {
			return {
				contents: sourceFromExports,
				loader: 'js',
				resolveDir: path.dirname(args.path),
			};
		}

		if (typeof candidate.contents === 'string' || candidate.contents instanceof Uint8Array) {
			return {
				contents: candidate.contents,
				loader: this.normalizeEsbuildLoader(candidate.loader) ?? this.inferEsbuildLoaderFromPath(args.path),
				resolveDir: typeof candidate.resolveDir === 'string' ? candidate.resolveDir : path.dirname(args.path),
			};
		}

		return undefined;
	}

	private resolvePluginPath(value: string, args: { importer: string }, contextRoot: string): string {
		if (path.isAbsolute(value)) {
			return value;
		}

		if (value.startsWith('.') || value.startsWith('..')) {
			const baseDir = args.importer ? path.dirname(args.importer) : contextRoot;
			return path.resolve(baseDir, value);
		}

		return value;
	}

	/**
	 * Creates an esbuild plugin bridge compatible with the existing Ecopages
	 * plugin API shape.
	 *
	 * **Plugin ordering is semantically significant.**
	 *
	 * Esbuild applies `onResolve` and `onLoad` hooks in the order they are
	 * registered: the first handler whose filter matches wins for `onResolve`,
	 * and the first handler that returns a non-`undefined` result wins for
	 * `onLoad`. Because we call `plugin.setup(bridge)` sequentially here, the
	 * position of each plugin in the `plugins` array determines its priority:
	 *
	 * - **Index 0** has the highest priority (its hooks run first).
	 * - **Last index** has the lowest priority (its hooks only run if no earlier
	 *   plugin claimed the path).
	 *
	 * When adding new integrations or processors, ensure security-critical plugins
	 * (e.g. `ecopages-client-graph-boundary`) are placed **before** general-purpose
	 * loaders in the array so they always get first refusal on every source file.
	 *
	 * There is currently no priority system or validation — correct ordering is
	 * the caller's responsibility.
	 */
	private createEcoPluginBridge(plugins: EcoBuildPlugin[], contextRoot: string): EsbuildPlugin {
		return {
			name: 'ecopages-plugin-bridge',
			setup: async (build) => {
				let moduleCounter = 0;

				const bridge: EcoBuildPluginBuilder = {
					onResolve: (options: { filter: RegExp; namespace?: string }, callback): void => {
						build.onResolve(options, async (args) => {
							const result = await callback({
								path: args.path,
								importer: args.importer,
								namespace: args.namespace,
							});

							if (!result || typeof result !== 'object') {
								return undefined;
							}

							const candidate = result as EcoBuildOnResolveResult;

							const resolveResult: EsbuildOnResolveResult = {};

							if (typeof candidate.path === 'string') {
								resolveResult.path = this.resolvePluginPath(candidate.path, args, contextRoot);
							}

							if (typeof candidate.namespace === 'string') {
								resolveResult.namespace = candidate.namespace;
							}

							if (typeof candidate.external === 'boolean') {
								resolveResult.external = candidate.external;
							}

							return Object.keys(resolveResult).length > 0 ? resolveResult : undefined;
						});
					},
					onLoad: (options: { filter: RegExp; namespace?: string }, callback): void => {
						build.onLoad(options, async (args) => {
							const result = await callback({
								path: args.path,
								namespace: args.namespace,
							});

							return this.convertPluginOnLoadResult(args, result);
						});
					},
					module: (specifier: string, callback): void => {
						const namespace = `ecopages-module-${moduleCounter}`;
						moduleCounter += 1;
						const filter = new RegExp(`^${this.escapeRegExp(specifier)}$`);

						build.onResolve({ filter }, () => ({
							path: specifier,
							namespace,
						}));

						build.onLoad({ filter, namespace }, async (args) => {
							const result = await callback();
							return this.convertPluginOnLoadResult(args, result);
						});
					},
				};

				for (const plugin of plugins) {
					await plugin.setup(bridge);
				}
			},
		};
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
				`${pathToFileURL(esbuildRequire.resolve('esbuild')).href}?ecopages_esbuild=${moduleGeneration}`
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
		const outdir = path.resolve(options.outdir ?? '.eco/assets');
		const tsconfigPath = path.join(contextRoot, 'tsconfig.json');
		const tsconfigExists = fileSystem.exists(tsconfigPath);

		const plugins = this.getPluginsForBuild(options.plugins);
		const esbuildPlugins: EsbuildPlugin[] = [
			...(plugins.length > 0 ? [this.createEcoPluginBridge(plugins, contextRoot)] : []),
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
			entryPoints: options.entrypoints,
			bundle: options.bundle ?? true,
			...outputOptions,
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

		return {
			success: true,
			logs,
			outputs,
			dependencyGraph,
		};
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
		const localRequire = createRequire(path.join(rootDir, 'package.json'));
		return localRequire.resolve(importPath);
	}

	/**
	 * Registers a build plugin once by plugin name.
	 */
	registerPlugin(plugin: EcoBuildPlugin): void {
		if (!this.registeredPlugins.find((registered) => registered.name === plugin.name)) {
			this.registeredPlugins.push(plugin);
		}
	}

	/**
	 * Returns transpile defaults for a known transpile profile.
	 */
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}
