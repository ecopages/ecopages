import type { BunPlugin } from 'bun';
import type { EcoBuildPlugin } from './build-types.ts';
import { getRequiredBunRuntime } from '../utils/runtime.ts';

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
}

export const defaultBuildAdapter: BuildAdapter = new BunBuildAdapter();
