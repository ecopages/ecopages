import type { BuildOptions, BuildResult, BuildTranspileProfile } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { getAppBrowserBuildPlugins, getAppBuildExecutor, getTranspileOptions } from '../../build/build-adapter.ts';
import { mergeEcoBuildPlugins } from '../../build/build-manifest.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';

export type BrowserBundleOptions = Omit<BuildOptions, 'target' | 'format' | 'sourcemap'> & {
	profile: BuildTranspileProfile;
};

export interface BrowserBundleExecutor {
	bundle(options: BrowserBundleOptions): Promise<BuildResult>;
}

/**
 * App-owned boundary for browser-oriented bundle work.
 *
 * @remarks
 * This service owns the shared browser transpile defaults and ensures browser
 * builds always run through the app-owned executor rather than direct backend
 * calls scattered across HMR and asset processing paths.
 */
export class BrowserBundleService implements BrowserBundleExecutor {
	private readonly appConfig: EcoPagesAppConfig;

	/**
	 * Creates the browser bundle boundary for one finalized app instance.
	 */
	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * Runs one browser-targeted build through the app-owned executor.
	 *
	 * @remarks
	 * Browser defaults and app-owned browser build plugins are applied here so HMR
	 * and runtime asset generation do not have to recreate that policy at each call
	 * site.
	 */
	async bundle(options: BrowserBundleOptions): Promise<BuildResult> {
		const { profile, ...rawBuildOptions } = options;
		const buildOptions = rawBuildOptions as Omit<BuildOptions, 'target' | 'format' | 'sourcemap'>;
		const plugins = buildOptions.plugins as EcoBuildPlugin[] | undefined;
		const request = {
			...buildOptions,
			...getTranspileOptions(profile),
			plugins: mergeEcoBuildPlugins(plugins, getAppBrowserBuildPlugins(this.appConfig)),
		} as BuildOptions;

		return await getAppBuildExecutor(this.appConfig).build(request);
	}
}
