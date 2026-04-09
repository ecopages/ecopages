export { ecopages } from './ecopages.ts';
export type {
	EcopagesViteOptions,
	EcopagesPluginApi,
	ResolvedEcopagesViteOptions,
	EcopagesHostConfig,
} from './plugin-api.ts';
export type { EcopagesVitePlugin, EcopagesVitePluginOption, EcopagesViteUserConfig } from './types.ts';
export { createEcopagesPluginApi, flattenPluginOptions, adaptSourceTransformToVitePlugin } from './plugin-api.ts';
export {
	ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID,
	ECOPAGES_ISLAND_REGISTRY_MODULE_ID,
	ECOPAGES_ISLAND_CLIENT_MODULE_ID,
} from './integration-di.ts';
