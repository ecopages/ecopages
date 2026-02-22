import { appLogger } from '../../../../global/app-logger';
import type { EcoPagesAppConfig } from '../../../../internal-types';
import { defaultBuildAdapter } from '../../../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import type { ScriptAsset } from '../../assets.types';
import { BaseProcessor } from './base-processor';

export abstract class BaseScriptProcessor<T extends ScriptAsset> extends BaseProcessor<T> {
	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		super({ appConfig });
	}

	protected shouldBundle(dep: T): boolean {
		return dep.bundle !== false;
	}

	protected getBundlerOptions(dep: T): Record<string, any> {
		return dep.bundleOptions || {};
	}

	protected collectBuildPlugins(): EcoBuildPlugin[] {
		const plugins: EcoBuildPlugin[] = [];

		if (this.appConfig.processors?.size) {
			for (const processor of this.appConfig.processors.values()) {
				if (processor.buildPlugins) {
					plugins.push(...processor.buildPlugins);
				}
			}
		}

		if (this.appConfig.loaders?.size) {
			plugins.push(...this.appConfig.loaders.values());
		}

		return plugins;
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
		const allPlugins = additionalPlugins ? [...buildPlugins, ...additionalPlugins] : buildPlugins;

		const build = await defaultBuildAdapter.build({
			entrypoints: [entrypoint],
			outdir,
			root: this.appConfig.rootDir,
			...defaultBuildAdapter.getTranspileOptions('browser-script'),
			splitting: true,
			naming: '[name]-[hash].[ext]',
			plugins: allPlugins,
			...rest,
		});

		if (!build.success) {
			for (const log of build.logs) {
				appLogger.debug(log.message, log);
			}
		}

		const entryBaseName = path.parse(entrypoint).name;
		const entryOutput = build.outputs
			.map((output) => output.path)
			.find((outputPath) => path.basename(outputPath) === `${entryBaseName}.js`);

		if (entryOutput) {
			return entryOutput;
		}

		const nonVendorOutput = build.outputs
			.map((output) => output.path)
			.find((outputPath) => !path.basename(outputPath).startsWith('vendors'));

		if (nonVendorOutput) {
			return nonVendorOutput;
		}

		const primaryOutput = build.outputs[0]?.path;
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

		const logMessage = build.logs.map((log) => log.message).join(' | ');
		throw new Error(`No build output generated for ${entrypoint}${logMessage ? `: ${logMessage}` : ''}`);
	}
}
