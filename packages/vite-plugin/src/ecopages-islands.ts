import type { EcopagesPluginApi } from './plugin-api.ts';
import { ECOPAGES_ISLAND_CLIENT_MODULE_ID, ECOPAGES_ISLAND_REGISTRY_MODULE_ID } from './integration-di.ts';
import type { EcopagesVitePlugin } from './types.ts';

const RESOLVED_ISLAND_CLIENT_MODULE_ID = `\0${ECOPAGES_ISLAND_CLIENT_MODULE_ID}`;

function createIslandClientModuleSource(): string {
	return [
		`import { islands } from '${ECOPAGES_ISLAND_REGISTRY_MODULE_ID}';`,
		'',
		'export const islandModules = islands;',
		'',
		'export async function hydrateIslands() {',
		'\treturn islandModules;',
		'}',
		'',
		"if (typeof window !== 'undefined') {",
		'\t(globalThis as typeof globalThis & { __ECOPAGES_ISLANDS__?: typeof islandModules }).__ECOPAGES_ISLANDS__ = islandModules;',
		'}',
		'',
	].join('\n');
}

/**
 * Serves the Ecopages island client runtime entrypoint as a virtual module.
 */
export function ecopagesIslands(_api: EcopagesPluginApi): EcopagesVitePlugin {
	return {
		name: 'ecopages:islands',
		resolveId(id) {
			if (id === ECOPAGES_ISLAND_CLIENT_MODULE_ID) {
				return RESOLVED_ISLAND_CLIENT_MODULE_ID;
			}

			return null;
		},
		load(id) {
			if (id !== RESOLVED_ISLAND_CLIENT_MODULE_ID) {
				return null;
			}

			return createIslandClientModuleSource();
		},
	};
}
