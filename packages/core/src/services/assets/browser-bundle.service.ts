import type { BuildOptions, BuildResult, BuildTranspileProfile } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { getAppBrowserBuildPlugins, getAppBuildExecutor, getAppTranspileOptions } from '../../build/build-adapter.ts';
import { mergeEcoBuildPlugins } from '../../build/build-manifest.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

export type BrowserBundleOptions = {
	entrypoints: string[];
	outdir?: string;
	outbase?: string;
	naming?: string;
	conditions?: string[];
	define?: Record<string, string>;
	minify?: boolean;
	treeshaking?: boolean;
	splitting?: boolean;
	root?: string;
	bundle?: boolean;
	externalPackages?: boolean;
	external?: string[];
	plugins?: EcoBuildPlugin[];
	[key: string]: unknown;
	profile: BuildTranspileProfile;
	excludeAppBuildPlugins?: string[];
};

type BrowserBundleGroupedOptions = {
	outdir?: string;
	outbase?: string;
	naming?: string;
	conditions?: string[];
	define?: Record<string, string>;
	minify?: boolean;
	treeshaking?: boolean;
	splitting?: boolean;
	root?: string;
	bundle?: boolean;
	externalPackages?: boolean;
	external?: string[];
	plugins?: EcoBuildPlugin[];
	[key: string]: unknown;
	profile: BuildTranspileProfile;
	excludeAppBuildPlugins?: string[];
};

export interface BrowserBundleExecutor {
	bundle(options: BrowserBundleOptions): Promise<BuildResult>;
}

export type BrowserBundleGroupedEntry = {
	entrypoint: string;
	entryName: string;
};

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
		const { profile, excludeAppBuildPlugins, plugins, ...rawBuildOptions } = options;
		const appBrowserPlugins = getAppBrowserBuildPlugins(this.appConfig);
		const filteredAppBrowserPlugins =
			excludeAppBuildPlugins && excludeAppBuildPlugins.length > 0
				? appBrowserPlugins.filter((plugin) => !excludeAppBuildPlugins.includes(plugin.name))
				: appBrowserPlugins;
		const request: BuildOptions = {
			...rawBuildOptions,
			entrypoints: options.entrypoints,
			...getAppTranspileOptions(this.appConfig, profile),
			plugins: mergeEcoBuildPlugins(plugins, filteredAppBrowserPlugins),
		};

		return await getAppBuildExecutor(this.appConfig).build(request);
	}

	async bundleGroupedEntries(
		entries: BrowserBundleGroupedEntry[],
		options: BrowserBundleGroupedOptions,
	): Promise<BuildResult> {
		const request: BrowserBundleOptions = {
			...options,
			entrypoints: entries.map((entry) => entry.entrypoint),
		};

		return this.bundle(request);
	}
}
