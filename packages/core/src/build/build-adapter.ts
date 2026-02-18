import type { BunPlugin } from 'bun';
import type { EcoBuildPlugin } from './build-types.ts';

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
	splitting?: boolean;
	root?: string;
	external?: string[];
	plugins?: EcoBuildPlugin[];
	[key: string]: unknown;
}

export interface BuildAdapter {
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
}

export class BunBuildAdapter implements BuildAdapter {
	async build(options: BuildOptions): Promise<BuildResult> {
		const result = await Bun.build({
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
		return Bun.resolveSync(importPath, rootDir);
	}
}

export const defaultBuildAdapter: BuildAdapter = new BunBuildAdapter();
