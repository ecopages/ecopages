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
		title: 'Kitchen Sink',
		description: 'Cross integration composition and interactivity',
	}),
	render: () => {
		return (
			<main>
				<h1>Kitchen Sink</h1>

				<KitaShell id="kita-root">
					<LitShell id="kita-lit-child">
						<ReactShell id="kita-react-child">kita-root-child</ReactShell>
					</LitShell>
				</KitaShell>

				<LitShell id="lit-root">
					<KitaShell id="lit-kita-child">
						<span data-cross-child="lit-root">lit-root-child</span>
					</KitaShell>
				</LitShell>

				<ReactShell id="react-root">react-root-child</ReactShell>

				<section>
					<h2>Deep React Graph</h2>
					<ReactShell id="react-deep-root">
						<ReactShell id="react-deep-middle">
							<ReactShell id="react-deep-leaf">react-deep-child</ReactShell>
						</ReactShell>
					</ReactShell>
				</section>

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
		);
	},
});
