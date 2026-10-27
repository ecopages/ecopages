/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './server-dom-radiant-probe.script';

export const ServerDomRadiantProbe = eco.component<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		scripts: [{ src: './server-dom-radiant-probe.script.tsx', ssr: true }],
	},
	render: () => <server-dom-radiant-probe />,
});

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'server-dom-radiant-probe': HtmlTag;
		}
	}
}
