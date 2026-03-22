import { appLogger } from '../../../../../global/app-logger';
import type { EcoPagesAppConfig } from '../../../../../internal-types';
import { getAppBrowserBuildPlugins } from '../../../../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../../../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import type { ScriptAsset } from '../../assets.types';
import { BaseProcessor } from './base-processor';
import { BrowserBundleService } from '../../../browser-bundle.service.ts';

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
		return dep.bundleOptions || {};
	}

	protected collectBuildPlugins(): EcoBuildPlugin[] {
		return getAppBrowserBuildPlugins(this.appConfig);
	}

	protected async bundleScript({
		entrypoint,
		outdir,
		plugins: additionalPlugins,
		...rest
	}: {
		entrypoint: string;
		outdir: string;
	} & ScriptAsset['bundleOptions']): Promise<string> {
		const buildPlugins = this.collectBuildPlugins();
		const allPlugins = additionalPlugins ? [...additionalPlugins, ...buildPlugins] : buildPlugins;

		const buildResult = await this.browserBundleService.bundle({
			profile: 'browser-script',
			entrypoints: [entrypoint],
			outdir,
			root: this.appConfig.rootDir,
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
}
