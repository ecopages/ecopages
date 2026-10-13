import { appLogger } from '../../../../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types.ts';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import type { ScriptAsset } from '../../assets.types.ts';
import { BaseProcessor } from './base-processor.ts';
import { BrowserBundleService, type BrowserBundleGroupedEntry } from '../../../browser-bundle.service.ts';
import { collectBuildEntryInputPaths, getBuildEntryOutput } from '../../../../../build/build-graph.ts';
import type { BuildResult } from '../../../../../build/build-adapter.ts';
import { formatBuildLog } from '../../../../../build/build-log.ts';

export type BundledScriptOutput = {
	filepath: string;
	inputPaths: string[];
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

	protected getBundlerOptions(dep: T): Record<string, any> {
		if (dep.packageRole === 'page-script' && dep.bundleOptions?.splitting === undefined) {
			return {
				...dep.bundleOptions,
				splitting: false,
			};
		}

		return dep.bundleOptions || {};
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
			profile: 'browser-script',
			entrypoints: [entrypoint],
			outdir,
			root: this.appConfig.rootDir,
			excludeAppBuildPlugins,
			splitting: true,
			naming: '[name]-[hash].[ext]',
			plugins: additionalPlugins,
			...rest,
		});

		if (!buildResult.success) {
			for (const log of buildResult.logs) {
				appLogger.debug(log.message, log);
			}
		}

		const entryOutput = getBuildEntryOutput(buildResult, entrypoint, this.appConfig.rootDir);
		if (entryOutput) {
			return this.toBundledScriptOutput(buildResult, entrypoint, entryOutput);
		}

		const logMessage = buildResult.logs.map(formatBuildLog).join('\n');
		throw new Error(`No build output generated for ${entrypoint}${logMessage ? `: ${logMessage}` : ''}`);
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
			profile: 'browser-script',
			outdir,
			root: this.appConfig.rootDir,
			excludeAppBuildPlugins,
			...rest,
			splitting: true,
			naming: '[name]-[hash].[ext]',
			plugins: additionalPlugins,
		});

		if (!buildResult.success) {
			for (const log of buildResult.logs) {
				appLogger.debug(log.message, log);
			}
		}

		const entryOutputs = new Map<string, BundledScriptOutput>();

		for (const entry of entries) {
			const output = getBuildEntryOutput(buildResult, entry.entrypoint, this.appConfig.rootDir);
			if (output) {
				entryOutputs.set(entry.entryName, this.toBundledScriptOutput(buildResult, entry.entrypoint, output));
				continue;
			}

			const logMessage = buildResult.logs.map(formatBuildLog).join('\n');
			throw new Error(
				`No build output generated for grouped entry ${entry.entryName}${logMessage ? `: ${logMessage}` : ''}`,
			);
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

	private toBundledScriptOutput(buildResult: BuildResult, entrypoint: string, filepath: string): BundledScriptOutput {
		return {
			filepath,
			inputPaths: collectBuildEntryInputPaths(buildResult, entrypoint, this.appConfig.rootDir),
		};
	}
}
