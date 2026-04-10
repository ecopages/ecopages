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
 * Returns an array of Vite plugins that handle config merging, virtual modules,
 * source transforms, island registration, metadata injection, JSX compatibility,
 * HMR, dev server bridging, and host-bridge integration.
 */
export function ecopages(
	options: Pick<EcopagesViteOptions, 'appConfig'> & Omit<Partial<EcopagesViteOptions>, 'appConfig'>,
): PluginOption[] {
	const { appConfig } = options;

	if (!appConfig) {
		throw new Error('[ecopages] appConfig is required');
	}

	if (!appConfig.integrations || !Array.isArray(appConfig.integrations)) {
		throw new Error('[ecopages] appConfig.integrations must be an array');
	}

	if (!appConfig.absolutePaths?.pagesDir || !appConfig.absolutePaths?.layoutsDir) {
		throw new Error('[ecopages] appConfig.absolutePaths must include pagesDir and layoutsDir');
	}

	if (!(appConfig.sourceTransforms instanceof Map)) {
		throw new Error('[ecopages] appConfig.sourceTransforms must be a Map');
	}

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
