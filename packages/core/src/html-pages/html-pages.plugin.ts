import { defineIntegration } from '../plugins/define-integration.ts';
import { HTML_PAGES_INTEGRATION_NAME } from './html-page-module.ts';
import { HtmlPageRenderer } from './html-page-renderer.ts';

/**
 * Core-owned Integration for `.html` Filesystem Routes.
 *
 * @remarks
 * `finalizeEcoPagesConfig()` appends it after user Integrations unless one of them
 * already owns `.html`, so apps never register it themselves.
 */
export const htmlPagesPlugin = defineIntegration({
	name: HTML_PAGES_INTEGRATION_NAME,
	extensions: ['.html'],
	renderer: HtmlPageRenderer,
});
