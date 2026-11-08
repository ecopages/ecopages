/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export const SsrOnceRadiantProbe = eco.component<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		scripts: [{ src: './ssr-once-radiant-probe.script.tsx', ssr: true }],
	},
	render: () => <ssr-once-radiant-probe />,
});

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'ssr-once-radiant-probe': HtmlTag;
		}
	}
}
