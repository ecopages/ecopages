/** @jsxImportSource @ecopages/jsx */
import '@ecopages/radiant/client/install-hydrator';
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';

@customElement('script-hmr-widget')
export class ScriptHmrWidget extends RadiantElement {
	override render() {
		return <span data-testid="script-hmr-widget">SCRIPT_WIDGET_BASELINE</span>;
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'script-hmr-widget': HtmlTag;
		}
	}
}
