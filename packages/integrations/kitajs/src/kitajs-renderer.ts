/**
 * This module contains the Kita.js renderer
 * @module
 */

import { createIntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { KITAJS_PLUGIN_NAME } from './kitajs.constants.ts';

/**
 * A renderer for the Kita.js integration, backed by core's shared route pipeline.
 */
export const KitaRenderer = createIntegrationRenderer(KITAJS_PLUGIN_NAME);
