/**
 * This module contains the default plugins used by the PostCSS Processor
 * @module
 */

import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import type postcss from 'postcss';
import postCssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import tailwindcssNesting from 'tailwindcss/nesting/index.js';

/**
 * Default PostCSS plugins
 * @type {postcss.AcceptedPlugin[]}
 **/
export const defaultPlugins: postcss.AcceptedPlugin[] = [
  postCssImport(),
  tailwindcssNesting,
  tailwindcss,
  autoprefixer,
  cssnano,
];
