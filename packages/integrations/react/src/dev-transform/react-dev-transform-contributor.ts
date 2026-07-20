import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { DevTransformBundleContributor } from '@ecopages/core/dev/transform-server';
import type { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';

export type ReactDevTransformContributorOptions = {
	strategy: ReactHmrStrategy;
};

/**
 * Supplies React page plugins for the core dev transform bundler.
 */
export class ReactDevTransformContributor implements DevTransformBundleContributor {
	private readonly strategy: ReactHmrStrategy;

	constructor(options: ReactDevTransformContributorOptions) {
		this.strategy = options.strategy;
	}

	ownsEntrypoint(entrypointPath: string): boolean {
		return this.strategy.ownsDevTransformEntrypoint(entrypointPath);
	}

	async getPageBuildPlugins(entrypointPath: string): Promise<readonly EcoBuildPlugin[]> {
		return this.strategy.createDevTransformPlugins(entrypointPath);
	}
}
