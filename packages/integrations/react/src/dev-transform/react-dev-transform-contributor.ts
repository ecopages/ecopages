import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { getBrowserRuntimeSpecifierMap } from '@ecopages/core/build/browser-runtime-manifest';
import type { DevTransformBundleContributor } from '@ecopages/core/dev/transform-server';
import type { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';

export type ReactDevTransformContributorOptions = {
	strategy: ReactHmrStrategy;
};

/**
 * Supplies React module plugins for the core dev transform bundler.
 */
export class ReactDevTransformContributor implements DevTransformBundleContributor {
	private readonly strategy: ReactHmrStrategy;

	constructor(options: ReactDevTransformContributorOptions) {
		this.strategy = options.strategy;
	}

	ownsModule(sourcePath: string): boolean {
		return this.strategy.ownsDevTransformEntrypoint(sourcePath);
	}

	async getModulePlugins(sourcePath: string): Promise<readonly EcoBuildPlugin[]> {
		return this.strategy.createDevTransformPlugins(sourcePath);
	}

	getRuntimeSpecifierMap(): ReadonlyMap<string, string> {
		return getBrowserRuntimeSpecifierMap(this.strategy.getRuntimeManifest());
	}

	async getVendorBundlePlugins(): Promise<readonly EcoBuildPlugin[]> {
		return this.strategy.getVendorBundlePlugins();
	}
}
