import { defineIntegration } from '../../plugins/define-integration.ts';
import { GhtmlRenderer } from './ghtml-renderer.ts';
import { GHTML_PLUGIN_NAME } from './ghtml.constants.ts';

export const ghtmlPlugin = defineIntegration({
	name: GHTML_PLUGIN_NAME,
	extensions: ['.ghtml.ts', '.ghtml.tsx', '.ghtml'],
	renderer: GhtmlRenderer,
});

/** @deprecated Use {@link ghtmlPlugin.Plugin} or {@link ghtmlPlugin} instead. */
export const GhtmlPlugin = ghtmlPlugin.Plugin;
