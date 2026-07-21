import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { DevTransformBundleContributor } from '@ecopages/core/dev/transform-server';
import type { EcopagesJsxHmrStrategy } from '../ecopages-jsx-hmr-strategy.ts';

export type EcopagesJsxDevTransformContributorOptions = {
	strategy: EcopagesJsxHmrStrategy;
	getMdxLoaderPlugin: () => EcoBuildPlugin | undefined;
};

/**
 * Supplies Ecopages JSX module plugins for the core dev transform bundler.
 */
export class EcopagesJsxDevTransformContributor implements DevTransformBundleContributor {
	private readonly strategy: EcopagesJsxHmrStrategy;
	private readonly getMdxLoaderPlugin: () => EcoBuildPlugin | undefined;

	constructor(options: EcopagesJsxDevTransformContributorOptions) {
		this.strategy = options.strategy;
		this.getMdxLoaderPlugin = options.getMdxLoaderPlugin;
	}

	ownsModule(sourcePath: string): boolean {
		return this.strategy.ownsDevTransformEntrypoint(sourcePath);
	}

	async getModulePlugins(sourcePath: string): Promise<readonly EcoBuildPlugin[]> {
		if (!sourcePath.endsWith('.mdx')) {
			return [];
		}

		const mdxLoader = this.getMdxLoaderPlugin();
		return mdxLoader ? [mdxLoader] : [];
	}
}
