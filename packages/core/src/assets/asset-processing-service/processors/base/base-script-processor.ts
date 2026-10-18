import type { EcoPagesAppConfig } from '../../../../types/internal-types.ts';
import path from 'node:path';
import type { ScriptAsset } from '../../assets.types.ts';
import { BaseProcessor } from './base-processor.ts';
import { BrowserBundleService, type BrowserBundleGroupedEntry } from '../../../browser-bundle.service.ts';
import { collectBuildEntryInputPaths, getBuildEntryOutput } from '../../../../build/build-graph.ts';
import type { BuildSuccess } from '../../../../build/build-adapter.ts';
import { assertBuildSucceeded } from '../../../../build/build-log.ts';
import type { EcoBuildPlugin } from '../../../../build/contracts/build-types.ts';
import type { ProcessedAsset } from '../../assets.types.ts';

export type BundledScriptOutput = {
	filepath: string;
	inputPaths: string[];
};

type PreparedGroupedScript<T extends ScriptAsset> = {
	dep: T;
	entryName: string;
	entrypoint: string;
	cleanup?: () => void;
};

export abstract class BaseScriptProcessor<T extends ScriptAsset> extends BaseProcessor<T> {
	private readonly browserBundleService: BrowserBundleService;

	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		super({ appConfig });
		this.browserBundleService = new BrowserBundleService(appConfig);
	}

	protected shouldBundle(dep: T): boolean {
		return dep.bundle !== false && dep.classic !== true;
	}

	protected getBundlerOptions(dep: T): NonNullable<ScriptAsset['bundleOptions']> {
		if (dep.packageRole === 'page-script' && dep.bundleOptions?.splitting === undefined) {
			return {
				...dep.bundleOptions,
				splitting: false,
			};
		}

		return dep.bundleOptions || {};
	}

	protected async processGroupedScripts(
		deps: T[],
		options: {
			shouldBundleTogether: boolean;
			prepareEntry: (dep: T) => Omit<PreparedGroupedScript<T>, 'dep'>;
			toProcessedAsset: (dep: T, output: BundledScriptOutput, entrypoint: string) => ProcessedAsset;
		},
	): Promise<ProcessedAsset[]> {
		if (deps.length === 0) {
			return [];
		}

		if (!options.shouldBundleTogether) {
			return Promise.all(deps.map((dep) => this.process(dep)));
		}

		const preparedEntries: PreparedGroupedScript<T>[] = [];
		try {
			for (const dep of deps) {
				preparedEntries.push({ dep, ...options.prepareEntry(dep) });
			}

			const outputPaths = await this.bundleScripts({
				...this.getGroupedBundlerOptions(deps),
				entries: preparedEntries.map(({ entryName, entrypoint }) => ({ entryName, entrypoint })),
				outdir: this.getAssetsDir(),
				minify: this.isProduction,
				naming: '[name]-[hash].[ext]',
			});

			return preparedEntries.map(({ dep, entryName, entrypoint }) => {
				const bundledOutput = outputPaths.get(entryName);
				if (!bundledOutput) {
					throw new Error(`Missing grouped bundle output for ${entryName}`);
				}

				return options.toProcessedAsset(dep, bundledOutput, entrypoint);
			});
		} finally {
			for (const { cleanup } of preparedEntries) {
				cleanup?.();
			}
		}
	}

	private getGroupedBundlerOptions(deps: T[]): NonNullable<ScriptAsset['bundleOptions']> {
		const options = deps.map((dep) => this.getBundlerOptions(dep));
		const primary = options[0] ?? {};
		const external = new Set(options.flatMap((option) => option.external ?? []));
		const excludedPlugins = new Set(options.flatMap((option) => option.excludeAppBuildPlugins ?? []));
		const plugins = new Set<EcoBuildPlugin>(options.flatMap((option) => option.plugins ?? []));
		const define: Record<string, string> = {};

		for (const option of options) {
			for (const [key, value] of Object.entries(option.define ?? {})) {
				const existing = define[key];
				if (existing !== undefined && existing !== value) {
					throw new Error(`Grouped script entries have conflicting bundleOptions.define values for "${key}"`);
				}
				define[key] = value;
			}
		}

		return {
			...primary,
			...(external.size > 0 ? { external: [...external] } : {}),
			...(excludedPlugins.size > 0 ? { excludeAppBuildPlugins: [...excludedPlugins] } : {}),
			...(plugins.size > 0 ? { plugins: [...plugins] } : {}),
			...(Object.keys(define).length > 0 ? { define } : {}),
			...(options.some((option) => option.splitting === false) ? { splitting: false } : {}),
			...(options.some((option) => option.treeshaking === false) ? { treeshaking: false } : {}),
		};
	}

	protected async bundleScript({
		entrypoint,
		outdir,
		excludeAppBuildPlugins,
		plugins: additionalPlugins,
		...rest
	}: {
		entrypoint: string;
		outdir: string;
	} & ScriptAsset['bundleOptions']): Promise<BundledScriptOutput> {
		const buildResult = await this.browserBundleService.bundle({
			lane: 'build',
			entrypoints: [entrypoint],
			outdir,
			root: this.appConfig.rootDir,
			excludeAppBuildPlugins,
			splitting: true,
			naming: '[name]-[hash].[ext]',
			plugins: additionalPlugins,
			...rest,
		});

		assertBuildSucceeded(buildResult, `Could not bundle ${entrypoint}`);
		const entryOutput = getBuildEntryOutput(buildResult, entrypoint, this.appConfig.rootDir);
		if (!entryOutput) {
			throw new Error(`No build output generated for ${entrypoint}`);
		}
		return this.toBundledScriptOutput(buildResult, entrypoint, entryOutput);
	}

	protected async bundleScripts({
		entries,
		outdir,
		excludeAppBuildPlugins,
		plugins: additionalPlugins,
		...rest
	}: {
		entries: BrowserBundleGroupedEntry[];
		outdir: string;
	} & ScriptAsset['bundleOptions']): Promise<Map<string, BundledScriptOutput>> {
		const buildResult = await this.browserBundleService.bundleGroupedEntries(entries, {
			lane: 'build',
			outdir,
			root: this.appConfig.rootDir,
			excludeAppBuildPlugins,
			splitting: true,
			...rest,
			naming: '[name]-[hash].[ext]',
			plugins: additionalPlugins,
		});

		assertBuildSucceeded(buildResult, 'Could not bundle the grouped entries');

		const entryOutputs = new Map<string, BundledScriptOutput>();

		for (const entry of entries) {
			const output = getBuildEntryOutput(buildResult, entry.entrypoint, this.appConfig.rootDir);
			if (output) {
				entryOutputs.set(entry.entryName, this.toBundledScriptOutput(buildResult, entry.entrypoint, output));
				continue;
			}

			throw new Error(`No build output generated for grouped entry ${entry.entryName}`);
		}

		return entryOutputs;
	}

	protected getBundledSourceFilepaths(
		dep: T,
		inputPaths: readonly string[] = [],
		excludedPaths: readonly string[] = [],
	): string[] | undefined {
		const excluded = new Set(excludedPaths.map((sourcePath) => path.resolve(sourcePath)));
		const sourcePaths = new Set(
			[...(dep.bundledSourceFilepaths ?? []), ...inputPaths].filter(
				(sourcePath) => !excluded.has(path.resolve(sourcePath)),
			),
		);
		return sourcePaths.size > 0 ? [...sourcePaths] : undefined;
	}

	private toBundledScriptOutput(
		buildResult: BuildSuccess,
		entrypoint: string,
		filepath: string,
	): BundledScriptOutput {
		return {
			filepath,
			inputPaths: collectBuildEntryInputPaths(buildResult, entrypoint, this.appConfig.rootDir),
		};
	}
}
