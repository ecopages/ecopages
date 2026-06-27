import { defineIntegration } from '@ecopages/core/plugins/define-integration';
import { KitaRenderer } from './kitajs-renderer.ts';
import { KITAJS_PLUGIN_NAME } from './kitajs.constants.ts';

/**
 * The name of the Kita.js plugin
 */
export const PLUGIN_NAME = KITAJS_PLUGIN_NAME;

export const kitajsPlugin = defineIntegration({
	name: PLUGIN_NAME,
	extensions: ['.kita.tsx'],
	jsxImportSource: '@kitajs/html',
	renderer: KitaRenderer,
});

/** @deprecated Use {@link kitajsPlugin.Plugin} or {@link kitajsPlugin} instead. */
export const KitaHtmlPlugin = kitajsPlugin.Plugin;
