import { eco } from '@ecopages/core';
import { KitaCounter } from '@/components/kita-counter.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { LitShell } from '@/components/lit-shell.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactMdxBlock } from '@/components/react-mdx-block.react';
import { ReactShell } from '@/components/react-shell.react';

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
			<ReactMdxBlock />
			<KitaCounter />
			<LitCounter />
			<ReactCounter />
		</main>
	),
});
