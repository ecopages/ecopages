import type { BunPlugin } from 'bun';
import path from 'node:path';
import { createRequire } from 'node:module';
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
		const outdir = path.resolve(options.outdir ?? '.eco/assets');
		const entry = Object.fromEntries(
			options.entrypoints.map((entrypoint, index) => [`entry_${index}`, path.resolve(entrypoint)]),
		);

		const compiler = rspack({
			mode: options.minify ? 'production' : 'development',
			context: options.root ? path.resolve(options.root) : process.cwd(),
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
			},
			module: {
				rules: [
					{
						test: /\\.[cm]?[jt]sx?$/,
						loader: 'builtin:swc-loader',
						options: {
							jsc: {
								parser: { syntax: 'typescript', tsx: true },
								transform: { react: { runtime: 'automatic' } },
							},
						},
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
		appLogger.debug(`Node Rspack adapter does not auto-register plugin '${plugin.name}'.`);
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export const defaultBuildAdapter: BuildAdapter = getBunRuntime() ? new BunBuildAdapter() : new NodeRspackBuildAdapter();
