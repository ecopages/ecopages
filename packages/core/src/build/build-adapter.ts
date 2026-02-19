import type { BunPlugin } from 'bun';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from './build-types.ts';
import { appLogger } from '../global/app-logger.ts';
import { getBunRuntime, getRequiredBunRuntime } from '../utils/runtime.ts';

export interface BuildLog {
	message: string;
}

export interface BuildOutput {
	path: string;
}

export interface BuildResult {
	success: boolean;
	logs: BuildLog[];
	outputs: BuildOutput[];
}

export interface BuildOptions {
	entrypoints: string[];
	outdir?: string;
	naming?: string;
	minify?: boolean;
	target?: string;
	format?: string;
	sourcemap?: string;
	splitting?: boolean;
	root?: string;
	external?: string[];
	plugins?: EcoBuildPlugin[];
	[key: string]: unknown;
}

export type BuildTranspileProfile = 'browser-script' | 'hmr-runtime' | 'hmr-entrypoint';

export interface BuildTranspileOptions {
	target: string;
	format: string;
	sourcemap: string;
}

export interface BuildAdapter {
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
	registerPlugin(plugin: EcoBuildPlugin): void;
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions;
}

type RspackAssetInfo = { name?: string };
type RspackErrorInfo = { message?: string };
type RspackStatsJson = {
	assets?: RspackAssetInfo[];
	errors?: RspackErrorInfo[];
};
type RspackStats = {
	hasErrors(): boolean;
	toJson(options?: Record<string, unknown>): RspackStatsJson;
};
type RspackCompiler = {
	run(callback: (error: Error | null, stats?: RspackStats) => void): void;
	close(callback: (error?: Error | null) => void): void;
};
type RspackFactory = (config: Record<string, unknown>) => RspackCompiler;

function resolveJsxImportSource(rootDir: string): string | undefined {
	const tsconfigPath = path.join(rootDir, 'tsconfig.json');

	if (!fileSystem.exists(tsconfigPath)) {
		return undefined;
	}

	try {
		const tsconfigContent = fileSystem.readFileSync(tsconfigPath).toString();
		const match = tsconfigContent.match(/"jsxImportSource"\s*:\s*"([^"]+)"/);
		return match?.[1];
	} catch {
		return undefined;
	}
}

function parseJsonc(jsonContent: string): unknown {
	const withoutBlockComments = jsonContent.replaceAll(/\/\*[\s\S]*?\*\//g, '');
	const withoutLineComments = withoutBlockComments.replaceAll(/(^|[^:\\])\/\/.*$/gm, '$1');
	const withoutTrailingCommas = withoutLineComments.replaceAll(/,\s*([}\]])/g, '$1');
	return JSON.parse(withoutTrailingCommas);
}

function loadTsconfigCompilerOptions(rootDir: string): {
	baseUrl?: string;
	paths?: Record<string, string[]>;
} {
	const tsconfigPath = path.join(rootDir, 'tsconfig.json');

	if (!fileSystem.exists(tsconfigPath)) {
		return {};
	}

	try {
		const tsconfigContent = fileSystem.readFileSync(tsconfigPath).toString();
		const parsed = parseJsonc(tsconfigContent) as {
			compilerOptions?: {
				baseUrl?: string;
				paths?: Record<string, string[]>;
			};
		};

		return parsed.compilerOptions ?? {};
	} catch {
		return {};
	}
}

function normalizePathAliasKey(aliasKey: string): string {
	return aliasKey.endsWith('/*') ? aliasKey.slice(0, -2) : aliasKey;
}

function normalizePathAliasTarget(aliasTarget: string): string {
	return aliasTarget.endsWith('/*') ? aliasTarget.slice(0, -2) : aliasTarget;
}

function resolveTsconfigAliases(rootDir: string): Record<string, string> {
	const { baseUrl = '.', paths } = loadTsconfigCompilerOptions(rootDir);
	const resolvedAliases: Record<string, string> = {};

	if (!paths) {
		return resolvedAliases;
	}

	const basePath = path.resolve(rootDir, baseUrl);

	for (const [rawAliasKey, aliasTargets] of Object.entries(paths)) {
		const firstTarget = aliasTargets[0];
		if (!firstTarget) {
			continue;
		}

		const aliasKey = normalizePathAliasKey(rawAliasKey);
		const aliasTarget = normalizePathAliasTarget(firstTarget);
		resolvedAliases[aliasKey] = path.resolve(basePath, aliasTarget);
	}

	return resolvedAliases;
}

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

export class BunBuildAdapter implements BuildAdapter {
	async build(options: BuildOptions): Promise<BuildResult> {
		const bun = getRequiredBunRuntime();
		const result = await bun.build({
			...options,
			plugins: options.plugins as BunPlugin[] | undefined,
		} as Bun.BuildConfig);

		return {
			success: result.success,
			logs: result.logs.map((log) => ({ message: log.message })),
			outputs: result.outputs.map((output) => ({ path: output.path })),
		};
	}

	resolve(importPath: string, rootDir: string): string {
		return getRequiredBunRuntime().resolveSync(importPath, rootDir);
	}

	registerPlugin(plugin: EcoBuildPlugin): void {
		getRequiredBunRuntime().plugin(plugin as BunPlugin);
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export class NodeRspackBuildAdapter implements BuildAdapter {
	private registeredPlugins: EcoBuildPlugin[] = [];

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private getPluginsForBuild(additionalPlugins?: EcoBuildPlugin[]): EcoBuildPlugin[] {
		const merged = [...this.registeredPlugins, ...(additionalPlugins ?? [])];
		const byName = new Map<string, EcoBuildPlugin>();

		for (const plugin of merged) {
			if (!byName.has(plugin.name)) {
				byName.set(plugin.name, plugin);
			}
		}

		return Array.from(byName.values());
	}

	private async createNodePluginHooks(plugins: EcoBuildPlugin[]): Promise<{
		onLoad: Array<{
			filter: RegExp;
			namespace?: string;
			callback: (args: { path: string; namespace?: string }) => Promise<any> | any;
		}>;
		onResolve: Array<{
			filter: RegExp;
			namespace?: string;
			callback: (args: { path: string; importer?: string; namespace?: string }) => Promise<any> | any;
		}>;
	}> {
		const onLoad: Array<{
			filter: RegExp;
			namespace?: string;
			callback: (args: { path: string; namespace?: string }) => Promise<any> | any;
		}> = [];
		const onResolve: Array<{
			filter: RegExp;
			namespace?: string;
			callback: (args: { path: string; importer?: string; namespace?: string }) => Promise<any> | any;
		}> = [];

		const build = {
			onLoad: (
				options: { filter: RegExp; namespace?: string },
				callback: (args: { path: string; namespace?: string }) => Promise<any> | any,
			): void => {
				onLoad.push({
					filter: options.filter,
					namespace: options.namespace,
					callback,
				});
			},
			onResolve: (
				options: { filter: RegExp; namespace?: string },
				callback: (args: { path: string; importer?: string; namespace?: string }) => Promise<any> | any,
			): void => {
				onResolve.push({
					filter: options.filter,
					namespace: options.namespace,
					callback,
				});
			},
			module: (specifier: string, callback: () => Promise<any> | any): void => {
				const namespace = `ecopages-module-${onLoad.length}`;
				const filter = new RegExp(`^${this.escapeRegExp(specifier)}$`);

				onResolve.push({
					filter,
					callback: () => ({
						path: specifier,
						namespace,
					}),
				});

				onLoad.push({
					filter,
					namespace,
					callback: async () => await callback(),
				});
			},
		};

		for (const plugin of plugins) {
			await plugin.setup(build as never);
		}

		return { onLoad, onResolve };
	}

	private convertLoadResultToModuleSource(result: any): string | undefined {
		if (!result) {
			return undefined;
		}

		if (typeof result.contents === 'string') {
			return result.contents;
		}

		if (result.loader === 'object' && result.exports && typeof result.exports === 'object') {
			const entries = Object.entries(result.exports as Record<string, unknown>)
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

	private async transformEntrypointWithPlugins(
		entrypoint: string,
		contextRoot: string,
		hooks: {
			onLoad: Array<{
				filter: RegExp;
				namespace?: string;
				callback: (args: { path: string; namespace?: string }) => Promise<any> | any;
			}>;
			onResolve: Array<{
				filter: RegExp;
				namespace?: string;
				callback: (args: { path: string; importer?: string; namespace?: string }) => Promise<any> | any;
			}>;
		},
	): Promise<string> {
		let resolvedPath = path.resolve(entrypoint);
		let namespace = 'file';

		for (const handler of hooks.onResolve) {
			if ((handler.namespace ?? 'file') !== namespace) {
				continue;
			}

			if (!handler.filter.test(resolvedPath)) {
				continue;
			}

			const result = await handler.callback({
				path: resolvedPath,
				importer: undefined,
				namespace,
			});

			if (result?.path) {
				resolvedPath = path.isAbsolute(result.path)
					? result.path
					: path.resolve(path.dirname(resolvedPath), result.path);
			}

			if (result?.namespace) {
				namespace = result.namespace;
			}
		}

		for (const handler of hooks.onLoad) {
			if ((handler.namespace ?? 'file') !== namespace) {
				continue;
			}

			if (!handler.filter.test(resolvedPath)) {
				continue;
			}

			const result = await handler.callback({
				path: resolvedPath,
				namespace,
			});

			const source = this.convertLoadResultToModuleSource(result);
			if (!source) {
				continue;
			}

			const relativePath = path.relative(contextRoot, resolvedPath);
			const outputPath = path.join(contextRoot, '.eco', 'cache', 'node-plugin-entrypoints', relativePath);
			fileSystem.ensureDir(path.dirname(outputPath));
			fileSystem.write(outputPath, source);

			return outputPath;
		}

		return resolvedPath;
	}

	private async loadRspackFactory(): Promise<RspackFactory> {
		const moduleName = '@rspack/core';
		const rspackModule = (await import(moduleName)) as {
			rspack?: unknown;
			default?: unknown;
		};

		const rspackFactory = rspackModule.rspack ?? rspackModule.default;

		if (typeof rspackFactory !== 'function') {
			throw new Error('Rspack is not available. Install @rspack/core to use Node bundling.');
		}

		return rspackFactory as RspackFactory;
	}

	private async closeCompiler(compiler: RspackCompiler): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			compiler.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	async build(options: BuildOptions): Promise<BuildResult> {
		const rspack = await this.loadRspackFactory();
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const plugins = this.getPluginsForBuild(options.plugins);
		const hooks = await this.createNodePluginHooks(plugins);
		const outdir = path.resolve(options.outdir ?? '.eco/assets');
		const jsxImportSource = resolveJsxImportSource(contextRoot);
		const appSrcDir = path.join(contextRoot, 'src');
		const hasAppSrcDir = fileSystem.exists(appSrcDir);
		const tsconfigAliases = resolveTsconfigAliases(contextRoot);
		const resolvedAliases = {
			...tsconfigAliases,
			...(hasAppSrcDir && !tsconfigAliases['@']
				? {
						'@': appSrcDir,
					}
				: {}),
		};
		const usedEntryNames = new Map<string, number>();
		const transformedEntrypoints = await Promise.all(
			options.entrypoints.map((entrypoint) =>
				this.transformEntrypointWithPlugins(entrypoint, contextRoot, hooks),
			),
		);
		const entry = Object.fromEntries(
			transformedEntrypoints.map((resolvedEntrypoint, index) => {
				const parsed = path.parse(resolvedEntrypoint);
				const baseName = parsed.name || `entry_${index}`;
				const count = usedEntryNames.get(baseName) ?? 0;
				usedEntryNames.set(baseName, count + 1);
				const entryName = count === 0 ? baseName : `${baseName}_${count}`;

				return [entryName, resolvedEntrypoint];
			}),
		);

		const compiler = rspack({
			mode: options.minify ? 'production' : 'development',
			context: contextRoot,
			entry,
			target: options.target === 'browser' ? 'web' : 'node',
			devtool: options.sourcemap === 'none' ? false : 'source-map',
			externals: options.external,
			experiments: {
				outputModule: options.format === 'esm',
			},
			optimization: {
				minimize: !!options.minify,
				splitChunks: options.splitting ? { chunks: 'all' } : false,
			},
			resolve: {
				extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
				alias: Object.keys(resolvedAliases).length > 0 ? resolvedAliases : undefined,
			},
			module: {
				rules: [
					{
						test: /\.[cm]?[jt]sx?$/,
						type: 'javascript/auto',
						exclude: [/node_modules/],
						use: [
							{
								loader: 'builtin:swc-loader',
								options: {
									jsc: {
										parser: {
											syntax: 'typescript',
											tsx: true,
											decorators: true,
										},
										transform: {
											decoratorVersion: '2022-03',
											react: {
												runtime: 'automatic',
												...(jsxImportSource ? { importSource: jsxImportSource } : {}),
											},
										},
										target: 'es2022',
									},
									module: {
										type: 'es6',
									},
								},
							},
						],
					},
					{
						test: /\.(css|scss|sass|less)$/,
						type: 'asset/source',
					},
				],
			},
			output: {
				path: outdir,
				filename: '[name].js',
				chunkFilename: '[name].js',
				module: options.format === 'esm',
			},
		});

		const stats = await new Promise<RspackStats>((resolve, reject) => {
			compiler.run((error, currentStats) => {
				if (error) {
					reject(error);
					return;
				}

				if (!currentStats) {
					reject(new Error('Rspack completed without stats output'));
					return;
				}

				resolve(currentStats);
			});
		});

		await this.closeCompiler(compiler);

		const statsJson = stats.toJson({ all: false, assets: true, errors: true });
		const logs = (statsJson.errors ?? []).map((error) => ({
			message: error.message ?? 'Unknown Rspack error',
		}));
		const outputs = (statsJson.assets ?? [])
			.map((asset) => asset.name)
			.filter((assetName): assetName is string => !!assetName)
			.map((assetName) => ({ path: path.join(outdir, assetName) }));

		return {
			success: !stats.hasErrors(),
			logs,
			outputs,
		};
	}

	resolve(importPath: string, rootDir: string): string {
		const localRequire = createRequire(path.join(rootDir, 'package.json'));
		return localRequire.resolve(importPath);
	}

	registerPlugin(plugin: EcoBuildPlugin): void {
		if (!this.registeredPlugins.find((registered) => registered.name === plugin.name)) {
			this.registeredPlugins.push(plugin);
		}
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export const defaultBuildAdapter: BuildAdapter = getBunRuntime() ? new BunBuildAdapter() : new NodeRspackBuildAdapter();
