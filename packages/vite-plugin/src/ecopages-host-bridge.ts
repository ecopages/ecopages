import { flattenPluginOptions, type EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';

/**
 * Adapts host-provided plugins into the composed Ecopages Vite plugin list.
 */
export function ecopagesHostBridge(api: EcopagesPluginApi): EcopagesVitePlugin[] {
	return flattenPluginOptions(api.options.host?.plugins(api));
}
