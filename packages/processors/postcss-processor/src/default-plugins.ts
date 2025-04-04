/**
 * This module contains the default plugins used by the PostCSS Processor
 * @module
 */

import tailwindcssPostcss from '@tailwindcss/postcss';
import type postcss from 'postcss';

export type PluginsRecord = Record<string, postcss.AcceptedPlugin>;

/**
 * Default plugins used by the PostCSS Processor
 */
export const defaultPlugins: PluginsRecord = {
  '@tailwindcss/postcss': tailwindcssPostcss,
};
