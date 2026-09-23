import { loadEcoPagesConfig } from '@ecopages/core/config';
import type { PluginOption } from 'vite';
import { ecopagesClientJsxCompat } from './ecopages-client-jsx-compat.ts';
import { ecopagesConfig } from './ecopages-config.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';
import { ecopagesHotUpdate } from './ecopages-hot-update.ts';
import { ecopagesIslands } from './ecopages-islands.ts';
import { ecopagesMetadata } from './ecopages-metadata.ts';
import { createEcopagesPluginApi } from './plugin-api.ts';
import type { ComposedEcopagesViteOptions, EcopagesViteOptions } from './plugin-api.ts';
import { ecopagesSourceTransforms } from './ecopages-source-transforms.ts';
import { ecopagesVirtualModules } from './ecopages-virtual-modules.ts';
import type { EcopagesVitePlugin } from './types.ts';

/**
 * Composes the Ecopages Vite plugin surface.
 *
 * @remarks
 * Pass the app config exported from the Ecopages project `eco.config` path.
 * The Vite plugin expects the public `EcoPagesAppConfig` export exposed by
 * `@ecopages/core` and validates the required directories and transforms before
 * registering the plugin buckets.
 *
 * Returns an array of Vite plugins that handle config merging, virtual modules,
 * source transforms, island registration, metadata injection, JSX compatibility,
 * HMR, dev server bridging, and host-bridge integration.
 */
function composeEcopagesPlugins(options: ComposedEcopagesViteOptions): PluginOption[] {
	const api = createEcopagesPluginApi(options);
	const plugins: EcopagesVitePlugin[] = [
		ecopagesClientJsxCompat(api),
		ecopagesConfig(api),
		ecopagesMetadata(api),
		...ecopagesSourceTransforms(api),
		ecopagesVirtualModules(api.appConfig),
		ecopagesIslands(api),
		ecopagesHotUpdate(api),
		ecopagesDevServer(api),
	];

	api.setResolvedPluginNames(plugins.map((plugin) => plugin.name));

	return plugins as PluginOption[];
}

/**
 * Composes the Ecopages Vite plugin surface.
 *
 * @remarks
 * When `appConfig` is omitted, loads `eco.config.ts` (or `configFile` /
 * `ECOPAGES_CONFIG_FILE`). The returned promise is valid in Vite's `plugins`
 * array.
 */
export function ecopages(options: EcopagesViteOptions = {}): Promise<PluginOption[]> {
	if (options.appConfig && options.configFile) {
		return Promise.reject(new Error('ecopages() accepts either appConfig or configFile, not both.'));
	}

	if (options.appConfig) {
		return Promise.resolve(composeEcopagesPlugins(options));
	}

	const { configFile: _cf, ...baseOptions } = options;
	return loadEcoPagesConfig({
		configFile: options.configFile,
		buildOwnership: 'vite-host',
	}).then((appConfig) => composeEcopagesPlugins({ ...baseOptions, appConfig }));
}
