import type { BunPlugin } from 'bun';
import { appLogger } from '../../../../global/app-logger';
import type { EcoPagesAppConfig } from '../../../../internal-types';
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

	private collectBuildPlugins(): BunPlugin[] {
		const plugins: BunPlugin[] = [];

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

		const build = await Bun.build({
			entrypoints: [entrypoint],
			outdir,
			root: this.appConfig.rootDir,
			target: 'browser',
			format: 'esm',
			splitting: true,
			naming: '[name].[ext]',
			plugins: allPlugins,
			...rest,
		});

		if (!build.success) {
			for (const log of build.logs) {
				appLogger.debug(log.message, log);
			}
		}

		return build.outputs[0].path;
	}
}
