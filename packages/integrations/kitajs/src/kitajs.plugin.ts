import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { KitaRenderer } from './kitajs-renderer.ts';
import { KITAJS_PLUGIN_NAME } from './kitajs.constants.ts';

/**
 * The name of the Kita.js plugin
 */
export const PLUGIN_NAME = KITAJS_PLUGIN_NAME;

/**
 * The Kita.js plugin class
 * This plugin provides support for Kita.js components in Ecopages
 */
export class KitaHtmlPlugin extends IntegrationPlugin {
	renderer = KitaRenderer;

	constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.kita.tsx'],
			jsxImportSource: '@kitajs/html',
			...options,
		});
	}
}

/**
 * Factory function to create a Kita.js plugin instance.
 * @param options Configuration options for the Kita.js plugin
 * @returns A new KitaHtmlPlugin instance
 */
export function kitajsPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): KitaHtmlPlugin {
	return new KitaHtmlPlugin(options);
}
