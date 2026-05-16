// @ts-nocheck: This demo intentionally mixes JSX engines on one page, which TypeScript cannot model accurately.
import { eco } from '@ecopages/core';
import { KitaCounter } from '@/components/kita-counter.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactMdxBlock } from '@/components/react-mdx-block.react';
import { KitaShell } from '@ecopages/testing/kitchen-sink/kita-shell';
import { LitShell } from '@ecopages/testing/kitchen-sink/lit-shell';
import { ReactShell } from '@ecopages/testing/kitchen-sink/react-shell';

export default eco.page({
	dependencies: {
		components: [KitaShell, LitShell, ReactShell, KitaCounter, LitCounter, ReactCounter, ReactMdxBlock],
	},
	metadata: () => ({
		title: 'React Entry',
		description: 'React integration entrypoint for kitchen sink',
	}),
	render: () => (
		<main>
			<h1>React Entry</h1>
			<ReactShell id="react-entry-root">react-entry-child</ReactShell>
			<KitaShell id="react-entry-kita-child">
				<LitShell id="react-entry-lit-child">
					<span data-cross-child="react-entry">react-entry-nested-child</span>
				</LitShell>
			</KitaShell>

			<section>
				<h2>MDX</h2>
				<ReactMdxBlock />
			</section>

			<section>
				<h2>Counters</h2>
				<KitaCounter />
				<LitCounter />
				<ReactCounter />
			</section>
		</main>
	),
});
