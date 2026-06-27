/**
 * This module contains the ghtml renderer
 * @module
 */

import { StringMarkupRenderer } from '../../route-renderer/orchestration/string-markup-renderer.ts';
import { GHTML_PLUGIN_NAME } from './ghtml.constants.ts';

/**
 * A renderer for the ghtml integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class GhtmlRenderer extends StringMarkupRenderer {
	name = GHTML_PLUGIN_NAME;
}
