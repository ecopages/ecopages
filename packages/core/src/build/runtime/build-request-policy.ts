import { requireAppRuntime } from '../../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { BuildEnvironment, BuildOptions } from '../contracts/build-contracts.ts';
import { appliesToBuildEnvironment } from '../contracts/build-manifest.ts';
import { createAliasResolverPlugin } from '../../plugins/alias-resolver-plugin.ts';
import { resolveBuildEnvironmentOptions } from './build-environment-options.ts';
import { getJsxOwnershipPlugins } from '../browser/jsx-ownership-plugins.ts';
import { createEcoComponentMetaPlugin } from '../../plugins/eco-component-meta-plugin.ts';
import { createPreserveImportMetaPlugin } from '../preserve-import-meta-transform.ts';

/**
 * App-owned plugins of one environment, in the order their hooks run.
 *
 * @remarks
 * Rolldown asks plugins in this order and the first one that returns a result for a resolve or load wins, so
 * position is priority: the alias resolver, then the sealed manifest's plugins for the environment (for the browser,
 * the plugins that also apply to the server, the browser runtime plugin, then the browser-only ones), then the JSX
 * ownership plugins. {@link resolveBuildPluginOrder} puts caller plugins before them and core's own transforms
 * after. The unified pages graph keys its cache by their names.
 */
export function resolveAppBuildPlugins(appConfig: EcoPagesAppConfig, environment: BuildEnvironment): EcoBuildPlugin[] {
	const projectDir = appConfig.absolutePaths?.projectDir;
	return [
		...(projectDir ? [createAliasResolverPlugin(projectDir)] : []),
		...requireAppRuntime(appConfig).buildManifest[environment],
		...getJsxOwnershipPlugins(appConfig),
	];
}

/**
 * Merges caller plugins with app-owned manifest plugins.
 *
 * @remarks
 * App-manifest plugins cannot be silently replaced by same-name caller plugins.
 * Unique caller plugins are prepended so first-wins Rolldown hooks (for example
 * React vendor/alias rewrites) still run before general app loaders. Use
 * `excludeAppBuildPlugins` on browser requests to omit app-owned plugins.
 */
export function mergeCallerBuildPlugins(
	appPlugins: EcoBuildPlugin[],
	callerPlugins?: EcoBuildPlugin[],
	environment?: BuildEnvironment,
): EcoBuildPlugin[] {
	if (!callerPlugins || callerPlugins.length === 0) {
		return appPlugins;
	}

	const appByName = new Map(appPlugins.map((plugin) => [plugin.name, plugin]));
	const uniqueCallerPlugins = callerPlugins.filter(
		(plugin) => (!environment || appliesToBuildEnvironment(plugin, environment)) && !appByName.has(plugin.name),
	);
	return [...uniqueCallerPlugins, ...appPlugins];
}

/**
 * The complete plugin list of one build request, in the order its hooks run.
 *
 * @remarks
 * Rolldown asks plugins in list order and the first result of a resolve or load hook wins, so this is the one place
 * that decides priority:
 *
 * 1. Caller plugins that apply to the environment and do not share a name with an app plugin, so a caller's
 *    vendor or alias rewrite runs before the general app loaders. A caller plugin cannot replace an app plugin of
 *    the same name.
 * 2. {@link resolveAppBuildPlugins}, less the names in `excludeAppBuildPlugins`. Use it to omit app plugins that a
 *    request replaces; an environment cannot express that.
 * 3. Core's own `transform` plugins: the component identity attribution, then the ones the request passes in
 *    `coreTransforms`. No contributed plugin runs after them, and one with their name throws instead of running
 *    next to a twin.
 */
export function resolveBuildPluginOrder(
	appConfig: EcoPagesAppConfig,
	environment: BuildEnvironment,
	options: {
		callerPlugins?: EcoBuildPlugin[];
		excludeAppBuildPlugins?: readonly string[];
		coreTransforms?: readonly EcoBuildPlugin[];
	},
): EcoBuildPlugin[] {
	const excluded = new Set(options.excludeAppBuildPlugins);
	const appPlugins = resolveAppBuildPlugins(appConfig, environment).filter((plugin) => !excluded.has(plugin.name));
	const plugins = mergeCallerBuildPlugins(appPlugins, options.callerPlugins, environment);
	const coreTransforms = [createEcoComponentMetaPlugin({ config: appConfig }), ...(options.coreTransforms ?? [])];

	const names = new Set(plugins.map((plugin) => plugin.name));
	for (const transform of coreTransforms) {
		if (names.has(transform.name)) {
			throw new Error(`Core transform "${transform.name}" has the name of a build plugin of the same request.`);
		}
	}
	return [...plugins, ...coreTransforms];
}

export type ServerBuildRequestInput = Partial<BuildOptions> & {
	entrypoints: BuildOptions['entrypoints'];
};

export type BrowserBuildRequestInput = Partial<BuildOptions> & {
	entrypoints: BuildOptions['entrypoints'];
	excludeAppBuildPlugins?: string[];
};

/**
 * Assembles a complete server-oriented {@link BuildOptions} before scheduling.
 *
 * @remarks
 * Environment defaults come from {@link resolveBuildEnvironmentOptions}; the
 * server entry and the emitted config add `reportPackagesOutsideRoot`
 * themselves. Plugins follow {@link resolveBuildPluginOrder}, so server module loading shares browser
 * attribution. Every server request
 * also gets {@link createPreserveImportMetaPlugin} for `runtimeOutdir` (or
 * `outdir`), so bundled modules, Core included, keep reading files relative to
 * their sources from `dist/.server/` and `.eco/.server-modules/`.
 */
export function createServerBuildRequest(appConfig: EcoPagesAppConfig, input: ServerBuildRequestInput): BuildOptions {
	const importMetaDir = input.runtimeOutdir ?? input.outdir;
	const plugins = resolveBuildPluginOrder(appConfig, 'server', {
		callerPlugins: input.plugins,
		coreTransforms: importMetaDir ? [createPreserveImportMetaPlugin(importMetaDir)] : [],
	});
	const { plugins: _callerPlugins, ...overrides } = input;

	return {
		...resolveBuildEnvironmentOptions('server', appConfig),
		...overrides,
		environment: 'server',
		entrypoints: input.entrypoints,
		...(plugins.length > 0 ? { plugins } : {}),
	};
}

/**
 * Assembles a complete browser-oriented {@link BuildOptions} before scheduling.
 *
 * @remarks
 * Applies browser environment defaults independently of the executor slot
 * chosen by {@link BrowserBundleService}.
 *
 * Plugins follow {@link resolveBuildPluginOrder}; `excludeAppBuildPlugins` omits app-owned names.
 *
 * @remarks
 * Specifiers of the browser runtime manifest are dropped from `external`. Rolldown checks `external` before any
 * plugin, so one listed there would stay a bare import instead of becoming the manifest's public URL, which the
 * browser runtime plugin maps while resolving.
 */
export function createBrowserBuildRequest(appConfig: EcoPagesAppConfig, input: BrowserBuildRequestInput): BuildOptions {
	const { excludeAppBuildPlugins, plugins: callerPlugins, ...overrides } = input;
	const plugins = resolveBuildPluginOrder(appConfig, 'browser', {
		callerPlugins,
		excludeAppBuildPlugins,
	});

	const { bySpecifier } = requireAppRuntime(appConfig).buildManifest.browserRuntimeManifest;

	return {
		...resolveBuildEnvironmentOptions('browser', appConfig),
		...overrides,
		...(overrides.external
			? { external: overrides.external.filter((specifier) => !bySpecifier.has(specifier)) }
			: {}),
		environment: 'browser',
		entrypoints: input.entrypoints,
		plugins,
	};
}
