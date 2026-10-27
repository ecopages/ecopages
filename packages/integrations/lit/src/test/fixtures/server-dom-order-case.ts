import { LitElement, html } from 'lit';
import { render } from '@lit-labs/ssr';
import { installConfiguredServerDom } from '@ecopages/core/integration';
import { installRadiantServerDom } from '../../../../ecopages-jsx/src/ecopages-jsx-radiant-light-dom.ts';
import { ecopagesJsxPlugin } from '../../../../ecopages-jsx/src/ecopages-jsx.plugin.ts';
import { ensureLitDomShim } from '../../dom-shim.ts';
import { litPlugin } from '../../lit.plugin.ts';

const RESULT_PREFIX = '__SERVER_DOM_ORDER__';
const TAG = 'server-dom-order-probe';

function defineProbe(): void {
	class ServerDomOrderProbe extends LitElement {
		override render() {
			return html`<span data-server-dom-lit-probe>lit-shadow</span>`;
		}
	}

	customElements.define(TAG, ServerDomOrderProbe);
}

async function renderProbe(): Promise<string> {
	let markup = '';
	for (const chunk of render(html`<server-dom-order-probe></server-dom-order-probe>`)) {
		markup += String(chunk);
	}
	return markup;
}

async function runOrder(order: string): Promise<string> {
	if (order === 'radiant-then-lit-define') {
		await installConfiguredServerDom([ecopagesJsxPlugin(), litPlugin()]);
		defineProbe();
	} else if (order === 'lit-define-then-radiant') {
		ensureLitDomShim();
		defineProbe();
		await installRadiantServerDom();
	} else if (order === 'lit-define-after-radiant') {
		await installRadiantServerDom();
		ensureLitDomShim();
		defineProbe();
	} else {
		throw new Error(`Unknown order "${order}"`);
	}

	return await renderProbe();
}

const order = process.argv[2] ?? '';

try {
	const markup = await runOrder(order);
	const ok = markup.includes('data-server-dom-lit-probe') && markup.includes('shadowrootmode');
	process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({ ok, markup })}\n`);
	if (!ok) {
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({ ok: false, error: message })}\n`);
	process.exitCode = 1;
}
