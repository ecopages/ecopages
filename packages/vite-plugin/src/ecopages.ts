import type { PluginOption } from 'vite';
import { ecopagesClientJsxCompat } from './ecopages-client-jsx-compat.ts';
import { ecopagesConfig } from './ecopages-config.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';
import { ecopagesHotUpdate } from './ecopages-hot-update.ts';
import { ecopagesIslands } from './ecopages-islands.ts';
import { ecopagesMetadata } from './ecopages-metadata.ts';
import { createEcopagesPluginApi, type EcopagesViteOptions } from './plugin-api.ts';
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
export function ecopages(
	options: Pick<EcopagesViteOptions, 'appConfig'> & Omit<Partial<EcopagesViteOptions>, 'appConfig'>,
): PluginOption[] {
	const api = createEcopagesPluginApi(options as EcopagesViteOptions);
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
