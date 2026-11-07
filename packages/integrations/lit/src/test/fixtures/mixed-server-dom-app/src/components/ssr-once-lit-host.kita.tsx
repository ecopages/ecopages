import { eco } from '@ecopages/core';

export const SsrOnceLitHost = eco.component({
	dependencies: {
		scripts: [{ src: './ssr-once-lit-probe.script.ts', ssr: true }],
	},
	render: () => <ssr-once-lit-probe></ssr-once-lit-probe>,
});
