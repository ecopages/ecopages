/**
 * This module contains the Kita.js renderer
 * @module
 */

import { StringMarkupRenderer } from '@ecopages/core/route-renderer/orchestration/string-markup-renderer';
import { KITAJS_PLUGIN_NAME } from './kitajs.constants.ts';

/**
 * A renderer for the Kita.js integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class KitaRenderer extends StringMarkupRenderer {
	name = KITAJS_PLUGIN_NAME;
}
