/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';

class ServerDomRadiantProbeElement extends RadiantElement {
	override render() {
		return <span data-server-dom-radiant-probe>radiant-host</span>;
	}
}

customElement('server-dom-radiant-probe')(ServerDomRadiantProbeElement);

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'server-dom-radiant-probe': HtmlTag;
		}
	}
}
