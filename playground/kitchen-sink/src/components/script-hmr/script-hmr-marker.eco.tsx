/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';

@customElement('script-hmr-marker')
export class ScriptHmrMarker extends RadiantElement {
	override render() {
		return <span data-testid="script-hmr-marker">SCRIPT_HMR_BASELINE</span>;
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'script-hmr-marker': HtmlTag;
		}
	}
}
