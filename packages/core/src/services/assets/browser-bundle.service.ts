import type { BuildResult } from '../../build/build-adapter.ts';
import { createBrowserBuildRequest, type BrowserBuildRequestInput } from '../../build/runtime/build-request-policy.ts';
import { requireBuildQueue, type BuildLane } from '../../build/runtime/build-queue.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { forgetHashedBrowserAsset, recordHashedBrowserAsset } from './hashed-browser-asset.ts';

/**
 * Browser-oriented build request accepted by {@link BrowserBundleService}.
 *
 * @remarks
 * `profile` names the purpose of the bundle and picks the {@link BuildLane}: `hmr-entrypoint` and `hmr-runtime`
 * run on `hmr`, every other purpose on `build`. Request options are always assembled with browser environment
 * defaults via {@link createBrowserBuildRequest}.
 *
 * The app's build queue shares a request that is identical to a queued or running one, and, inside a
 * request scope, to one that finished.
 */
export type BrowserBundleOptions = BrowserBuildRequestInput & {
	profile: 'browser-script' | 'hmr-runtime' | 'hmr-entrypoint';
};

type BrowserBundleGroupedOptions = Omit<BrowserBundleOptions, 'entrypoints'>;

export type BrowserBundleGroupedEntry = {
	entrypoint: string;
	entryName: string;
};

function resolveBrowserBundleLane(profile: BrowserBundleOptions['profile']): BuildLane {
	return profile === 'hmr-entrypoint' || profile === 'hmr-runtime' ? 'hmr' : 'build';
}

/**
 * App-owned boundary for browser-oriented bundle work.
 *
 * @remarks
 * Owns shared browser transpile defaults and ensures browser builds run through
 * the app-owned executor rather than direct backend calls. Assembles a complete
 * request via {@link createBrowserBuildRequest} before scheduling.
 */
export class BrowserBundleService {
	private readonly appConfig: EcoPagesAppConfig;

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * Runs one browser-targeted build through the app-owned executor.
	 *
	 * @remarks
	 * Browser defaults, app-owned browser plugins, and core's own `transform` plugins
	 * are applied here so HMR and asset generation do not recreate that policy at
	 * each call site.
	 */
	async bundle(options: BrowserBundleOptions): Promise<BuildResult> {
		const { profile, ...requestInput } = options;
		const request = createBrowserBuildRequest(this.appConfig, requestInput);

		const result = await requireBuildQueue(this.appConfig).build(request, resolveBrowserBundleLane(profile));
		if (result.success && options.writeToDisk !== false) {
			for (const output of result.outputs) {
				if (output.contentHashed === true) {
					recordHashedBrowserAsset(output.path);
				} else if (output.contentHashed === false) {
					forgetHashedBrowserAsset(output.path);
				}
			}
		}
		startupTrace.recordBrowserBundle(result.success ? result.outputs : []);
		return result;
	}

	async bundleGroupedEntries(
		entries: BrowserBundleGroupedEntry[],
		options: BrowserBundleGroupedOptions,
	): Promise<BuildResult> {
		const request: BrowserBundleOptions = {
			...options,
			entrypoints: Object.fromEntries(entries.map((entry) => [entry.entryName, entry.entrypoint])),
		};

		return this.bundle(request);
	}
}
