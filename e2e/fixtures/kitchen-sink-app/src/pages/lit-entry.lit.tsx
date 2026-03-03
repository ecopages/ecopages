import { eco } from '@ecopages/core';
import { KitaCounter } from '@/components/kita-counter.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { LitShell } from '@/components/lit-shell.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactMdxBlock } from '@/components/react-mdx-block.react';
import { ReactShell } from '@/components/react-shell.react';

export default eco.page({
	integration: 'lit',
	dependencies: {
		components: [
			KitaShell,
			LitShell,
			ReactShell,
			KitaCounter,
			LitCounter,
			ReactCounter,
			ReactMdxBlock,
		],
	},
	metadata: () => ({
		title: 'Lit Entry',
		description: 'Lit integration entrypoint for kitchen sink',
	}),
	render: () => (
		<main>
			<h1>Lit Entry</h1>
			<LitShell id="lit-entry-root">
				<KitaShell id="lit-entry-kita-child">
					<span data-cross-child="lit-entry">lit-entry-child</span>
				</KitaShell>
			</LitShell>
			<ReactShell id="lit-entry-react-child">lit-entry-react-child</ReactShell>

			<section>
				<h2>Counters</h2>
				<KitaCounter />
				<LitCounter />
				<ReactCounter />
			</section>

			<section>
				<h2>MDX</h2>
				<ReactMdxBlock />
			</section>
		</main>
	),
});
