import { createVitePluginFromSourceTransform } from '@ecopages/core';
import { adaptSourceTransformToVitePlugin, type EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';
import { isReservedEcopagesSourceTransformName } from './ecopages-metadata.ts';

/**
 * Adapts app-config source transforms into Vite transform plugins.
 *
 * @remarks
 * Reserved transforms that already have a dedicated plugin bucket are excluded
 * so each Ecopages concern has one authoritative registration point.
 */
export function ecopagesSourceTransforms(api: EcopagesPluginApi): EcopagesVitePlugin[] {
	return api
		.getSourceTransforms()
		.filter((transform) => !isReservedEcopagesSourceTransformName(transform.name))
		.map((transform) => adaptSourceTransformToVitePlugin(createVitePluginFromSourceTransform(transform)));
}
