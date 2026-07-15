import type { BuildExecutor, BuildResult } from '../../build/build-adapter.ts';
import { createBrowserBuildRequest } from '../../build/runtime/build-request-policy.ts';
import { requireBuildRuntime } from '../../build/runtime/build-runtime.ts';
import type { BuildTranspileProfile } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { requestBuildDedupe } from '../../diagnostics/request-build-dedupe.ts';
import { createBuildRequestIdentity } from '../../build/runtime/build-request-identity.ts';

/**
 * Browser-oriented build request accepted by {@link BrowserBundleService}.
 *
 * @remarks
 * `profile` is a {@link BuildTranspileProfile} (transpile settings only).
 * `executor` selects the {@link BuildRuntime} concurrency slot:
 * - `'hmr'` + (`hmr-entrypoint` | `hmr-runtime`) → `'browser-hmr'`
 * - everything else (including `browser-script`, and `'build'`) → `'route-module'`
 *
 * Defaults `executor` to `'hmr'`. Request options are always assembled with
 * browser-hmr *defaults* via {@link createBrowserBuildRequest}; only the
 * concurrency/dedupe wrapper differs.
 *
 * Uses request-scope {@link requestBuildDedupe} plus in-flight
 * {@link DedupingBuildExecutor} coalescing; both key on
 * {@link createBuildRequestIdentity}.
 */
export type BrowserBundleOptions = {
	entrypoints: string[] | Record<string, string>;
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
	executor?: 'build' | 'hmr';
	profile: BuildTranspileProfile;
	excludeAppBuildPlugins?: string[];
};

type BrowserBundleGroupedOptions = Omit<BrowserBundleOptions, 'entrypoints'>;

export interface BrowserBundleExecutor {
	bundle(options: BrowserBundleOptions): Promise<BuildResult>;
}

export type BrowserBundleGroupedEntry = {
	entrypoint: string;
	entryName: string;
};

function resolveBrowserBundleExecutor(
	appConfig: EcoPagesAppConfig,
	profile: BuildTranspileProfile,
	executor: 'build' | 'hmr',
): BuildExecutor {
	const buildRuntime = requireBuildRuntime(appConfig);

	if (executor === 'hmr' && (profile === 'hmr-entrypoint' || profile === 'hmr-runtime')) {
		return buildRuntime.getProfile('browser-hmr');
	}

	return buildRuntime.getProfile('route-module');
}

/**
 * App-owned boundary for browser-oriented bundle work.
 *
 * @remarks
 * Owns shared browser transpile defaults and ensures browser builds run through
 * the app-owned executor rather than direct backend calls. Assembles a complete
 * request via {@link createBrowserBuildRequest} before scheduling.
 */
export class BrowserBundleService implements BrowserBundleExecutor {
	private readonly appConfig: EcoPagesAppConfig;

	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * Runs one browser-targeted build through the app-owned executor.
	 *
	 * @remarks
	 * Browser defaults, app-owned browser plugins, and
	 * {@link getAppSourceTransforms | app source transforms} are applied here
	 * so HMR and asset generation do not recreate that policy at each call site.
	 */
	async bundle(options: BrowserBundleOptions): Promise<BuildResult> {
		const { profile, executor = 'hmr', ...requestInput } = options;
		const request = createBrowserBuildRequest(this.appConfig, {
			...requestInput,
			profile,
		});

		const buildExecutor = resolveBrowserBundleExecutor(this.appConfig, profile, executor);
		const dedupeKey = createBuildRequestIdentity(request);

		return requestBuildDedupe.dedupeBuild(dedupeKey, async () => {
			const result = await buildExecutor.build(request);
			startupTrace.recordBrowserBundle(result.outputs);
			return result;
		});
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
