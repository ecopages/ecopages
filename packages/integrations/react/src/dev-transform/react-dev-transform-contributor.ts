import type { EcoBuildPlugin } from '@ecopages/core/integration';
import type { DevTransformBundleContributor, DevTransformVendorEntries } from '@ecopages/core/integration';
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

	ownsModule(sourcePath: string, variant?: string): boolean {
		return this.strategy.ownsDevTransformEntrypoint(sourcePath, variant);
	}

	async getModulePlugins(sourcePath: string, variant?: string): Promise<readonly EcoBuildPlugin[]> {
		return this.strategy.createDevTransformPlugins(sourcePath, variant);
	}

	getVendorEntries(): DevTransformVendorEntries {
		return this.strategy.getVendorEntries();
	}

	async getVendorBundlePlugins(): Promise<readonly EcoBuildPlugin[]> {
		return this.strategy.getVendorBundlePlugins();
	}
}
