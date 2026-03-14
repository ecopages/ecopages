/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { LitCounter } from './lit-counter.lit';
import { ReactCounter } from './react-counter.react';

export const ReactMdxBlock = eco.component<{}, ReactNode>({
	integration: 'react',
	dependencies: {
		components: [ReactCounter, LitCounter],
	},
	render: () => (
		<section className="integration-matrix__prose" data-react-mdx>
			<h2>React content lane</h2>
			<p>
				This block stays inside the React integration while still rendering both the React counter and the Lit
				custom element. The standalone <a href="/docs">docs route</a> continues covering file-based MDX in the
				same app.
			</p>
			<h3>Embedded counters</h3>
			<div className="flex gap-3">
				<ReactCounter />
				<lit-counter count={1}></lit-counter>
			</div>
		</section>
	),
});
