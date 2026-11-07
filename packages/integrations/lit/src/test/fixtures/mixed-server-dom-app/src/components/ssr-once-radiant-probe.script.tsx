/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { recordSsrScriptEvaluation } from './ssr-script-evaluations.ts';

recordSsrScriptEvaluation('ssr-once-radiant-probe');

class SsrOnceRadiantProbeElement extends RadiantElement {
	override render() {
		return <span data-ssr-once-radiant-probe>radiant-once</span>;
	}
}

if (!customElements.get('ssr-once-radiant-probe')) {
	customElement('ssr-once-radiant-probe')(SsrOnceRadiantProbeElement);
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'ssr-once-radiant-probe': HtmlTag;
		}
	}
}
