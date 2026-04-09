import { createVitePluginFromSourceTransform, createEcoComponentMetaTransform } from '@ecopages/core';
import { adaptSourceTransformToVitePlugin, type EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';

const ECO_COMPONENT_META_TRANSFORM_NAME = 'eco-component-meta-plugin';

/**
 * Returns whether a source-transform name is reserved by the composed Ecopages
 * Vite plugin surface.
 */
export function isReservedEcopagesSourceTransformName(transformName: string): boolean {
	return transformName === ECO_COMPONENT_META_TRANSFORM_NAME;
}

/**
 * Registers the Ecopages component metadata transform as a Vite plugin.
 */
export function ecopagesMetadata(api: EcopagesPluginApi): EcopagesVitePlugin {
	const transform = createEcoComponentMetaTransform({ config: api.appConfig });
	return adaptSourceTransformToVitePlugin(createVitePluginFromSourceTransform(transform), 'ecopages:metadata');
}
