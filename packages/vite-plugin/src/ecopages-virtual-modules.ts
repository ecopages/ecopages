import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EcoPagesAppConfig } from '@ecopages/core';
import {
	createIntegrationManifestModuleSource,
	createIslandRegistryModuleSourceFromConfig,
	ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID,
	ECOPAGES_ISLAND_REGISTRY_MODULE_ID,
} from './integration-di.ts';
import type { EcopagesVitePlugin } from './types.ts';

const LEGACY_IMAGE_MODULE_ID = 'ecopages:images';
const IMAGE_VIRTUAL_MODULE_ID = 'virtual:ecopages/images.ts';
const RESOLVED_IMAGE_VIRTUAL_MODULE_ID = `\0${IMAGE_VIRTUAL_MODULE_ID}`;
const RESOLVED_INTEGRATION_MANIFEST_MODULE_ID = `\0${ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID}`;
const RESOLVED_ISLAND_REGISTRY_MODULE_ID = `\0${ECOPAGES_ISLAND_REGISTRY_MODULE_ID}`;
const IMAGE_PROCESSOR_NAME = 'ecopages-image-processor';
const IMAGE_MODULE_READ_ATTEMPTS = 30;
const IMAGE_MODULE_READ_DELAY_MS = 100;

async function readImageVirtualModuleSource(modulePath: string): Promise<string> {
	for (let attempt = 0; attempt < IMAGE_MODULE_READ_ATTEMPTS; attempt += 1) {
		try {
			const source = await fs.readFile(modulePath, 'utf8');
			return source.replaceAll(/\s+as const;/g, ';');
		} catch (error) {
			const errno = (error as NodeJS.ErrnoException).code;
			if (errno !== 'ENOENT' || attempt === IMAGE_MODULE_READ_ATTEMPTS - 1) {
				throw error;
			}

			await new Promise((resolve) => setTimeout(resolve, IMAGE_MODULE_READ_DELAY_MS));
		}
	}

	throw new Error(`[ecopages] Failed to read image virtual module at '${modulePath}'`);
}

/**
 * Serves Ecopages-owned virtual modules: integration manifest, island registry,
 * and image processor bridge.
 */
export function ecopagesVirtualModules(appConfig: EcoPagesAppConfig): EcopagesVitePlugin {
	const runtimeImageModulePath = path.join(
		appConfig.absolutePaths.distDir,
		'cache',
		IMAGE_PROCESSOR_NAME,
		'virtual-module.ts',
	);

	return {
		name: 'ecopages-virtual-modules',
		apply: 'serve',
		resolveId(id) {
			if (id === LEGACY_IMAGE_MODULE_ID || id === IMAGE_VIRTUAL_MODULE_ID) {
				return RESOLVED_IMAGE_VIRTUAL_MODULE_ID;
			}

			if (id === ECOPAGES_INTEGRATION_MANIFEST_MODULE_ID) {
				return RESOLVED_INTEGRATION_MANIFEST_MODULE_ID;
			}

			if (id === ECOPAGES_ISLAND_REGISTRY_MODULE_ID) {
				return RESOLVED_ISLAND_REGISTRY_MODULE_ID;
			}

			return null;
		},
		async load(id) {
			if (id === RESOLVED_IMAGE_VIRTUAL_MODULE_ID) {
				return readImageVirtualModuleSource(runtimeImageModulePath);
			}

			if (id === RESOLVED_INTEGRATION_MANIFEST_MODULE_ID) {
				return createIntegrationManifestModuleSource(appConfig);
			}

			if (id === RESOLVED_ISLAND_REGISTRY_MODULE_ID) {
				return createIslandRegistryModuleSourceFromConfig(appConfig);
			}

			return null;
		},
	};
}
