import type { BuildOptions, BuildResult, BuildTranspileProfile } from '../build/build-adapter.ts';
import { getAppBrowserBuildPlugins, getAppBuildExecutor, getTranspileOptions } from '../build/build-adapter.ts';
import { mergeEcoBuildPlugins } from '../build/build-manifest.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';

export type BrowserBundleOptions = Omit<BuildOptions, 'target' | 'format' | 'sourcemap'> & {
	profile: BuildTranspileProfile;
};

/**
 * App-owned boundary for browser-oriented bundle work.
 *
 * @remarks
 * This service owns the shared browser transpile defaults and ensures browser
 * builds always run through the app-owned executor rather than direct backend
 * calls scattered across HMR and asset processing paths.
 */
export class BrowserBundleService {
	private readonly appConfig: EcoPagesAppConfig;

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	async bundle(options: BrowserBundleOptions): Promise<BuildResult> {
		const { profile, ...buildOptions } = options;

		return await getAppBuildExecutor(this.appConfig).build({
			...buildOptions,
			...getTranspileOptions(profile),
			plugins: mergeEcoBuildPlugins(buildOptions.plugins, getAppBrowserBuildPlugins(this.appConfig)),
		});
	}
}
