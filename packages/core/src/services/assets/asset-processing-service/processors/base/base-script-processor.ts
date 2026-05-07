import { appLogger } from '../../../../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types.ts';
import { getAppBrowserBuildPlugins } from '../../../../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../../../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import type { ScriptAsset } from '../../assets.types.ts';
import { BaseProcessor } from './base-processor.ts';
import {
	BrowserBundleService,
	type BrowserBundleGroupedEntry,
} from '../../../browser-bundle.service.ts';

export abstract class BaseScriptProcessor<T extends ScriptAsset> extends BaseProcessor<T> {
	private readonly browserBundleService: BrowserBundleService;

	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		super({ appConfig });
		this.browserBundleService = new BrowserBundleService(appConfig);
	}

	protected shouldBundle(dep: T): boolean {
		return dep.bundle !== false;
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

	protected collectBuildPlugins(excludePluginNames?: string[]): EcoBuildPlugin[] {
		const buildPlugins = getAppBrowserBuildPlugins(this.appConfig);
		if (!excludePluginNames || excludePluginNames.length === 0) {
			return buildPlugins;
		}

		const excluded = new Set(excludePluginNames);
		return buildPlugins.filter((plugin) => !excluded.has(plugin.name));
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
	} & ScriptAsset['bundleOptions']): Promise<string> {
		const buildPlugins = this.collectBuildPlugins(excludeAppBuildPlugins);
		const allPlugins = additionalPlugins ? [...additionalPlugins, ...buildPlugins] : buildPlugins;

		const buildResult = await this.browserBundleService.bundle({
			profile: 'browser-script',
			entrypoints: [entrypoint],
			outdir,
			root: this.appConfig.rootDir,
			excludeAppBuildPlugins,
			splitting: true,
			naming: '[name]-[hash].[ext]',
			plugins: allPlugins,
			...rest,
		});

		if (!buildResult.success) {
			for (const log of buildResult.logs) {
				appLogger.debug(log.message, log);
			}
		}

		const entryBaseName = path.parse(entrypoint).name;
		const entryOutput = buildResult.outputs
			.map((output) => output.path)
			.find((outputPath) => path.basename(outputPath) === `${entryBaseName}.js`);

		if (entryOutput) {
			return entryOutput;
		}

		const nonVendorOutput = buildResult.outputs
			.map((output) => output.path)
			.find((outputPath) => !path.basename(outputPath).startsWith('vendors'));

		if (nonVendorOutput) {
			return nonVendorOutput;
		}

		const primaryOutput = buildResult.outputs[0]?.path;
		if (primaryOutput) {
			return primaryOutput;
		}

		const namedFallbackOutput = path.join(outdir, `${entryBaseName}.js`);
		if (fileSystem.exists(namedFallbackOutput)) {
			return namedFallbackOutput;
		}

		const fallbackOutput = path.join(outdir, 'entry_0.js');
		if (fileSystem.exists(fallbackOutput)) {
			return fallbackOutput;
		}

		const logMessage = buildResult.logs.map((log) => log.message).join(' | ');
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
	} & ScriptAsset['bundleOptions']): Promise<Map<string, string>> {
		const buildPlugins = this.collectBuildPlugins(excludeAppBuildPlugins);
		const allPlugins = additionalPlugins ? [...additionalPlugins, ...buildPlugins] : buildPlugins;

		const buildResult = await this.browserBundleService.bundleGroupedEntries(entries, {
			profile: 'browser-script',
			outdir,
			root: this.appConfig.rootDir,
			excludeAppBuildPlugins,
			...rest,
			splitting: true,
			naming: '[name]-[hash].[ext]',
			plugins: allPlugins,
		});

		if (!buildResult.success) {
			for (const log of buildResult.logs) {
				appLogger.debug(log.message, log);
			}
		}

		const outputs = buildResult.outputs.map((output) => output.path);
		const entryOutputs = new Map<string, string>();

		for (const entry of entries) {
			const exactOutput = outputs.find((outputPath) => path.basename(outputPath) === `${entry.entryName}.js`);
			if (exactOutput) {
				entryOutputs.set(entry.entryName, exactOutput);
				continue;
			}

			const hashedOutput = outputs.find((outputPath) => path.basename(outputPath).startsWith(`${entry.entryName}-`));
			if (hashedOutput) {
				entryOutputs.set(entry.entryName, hashedOutput);
				continue;
			}

			const fallbackOutput = path.join(outdir, `${entry.entryName}.js`);
			if (fileSystem.exists(fallbackOutput)) {
				entryOutputs.set(entry.entryName, fallbackOutput);
				continue;
			}

			const logMessage = buildResult.logs.map((log) => log.message).join(' | ');
			throw new Error(
				`No build output generated for grouped entry ${entry.entryName}${logMessage ? `: ${logMessage}` : ''}`,
			);
		}

		return entryOutputs;
	}
}
