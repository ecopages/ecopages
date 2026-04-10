export { ecopages } from './ecopages.ts';
export type { EcopagesViteOptions, EcopagesPluginApi, ResolvedEcopagesViteOptions } from './plugin-api.ts';
export type { EcopagesVitePlugin, EcopagesViteUserConfig } from './types.ts';
export { createEcopagesPluginApi, adaptSourceTransformToVitePlugin } from './plugin-api.ts';
export {
	ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID,
	ECOPAGES_ISLAND_REGISTRY_MODULE_ID,
	ECOPAGES_ISLAND_CLIENT_MODULE_ID,
} from './integration-di.ts';
