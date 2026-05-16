import { eco } from '@ecopages/core';
import { EcoEmbed } from '@ecopages/kitajs/eco-embed';
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
		title: 'Kitchen Sink',
		description: 'Cross integration composition and interactivity',
	}),
	render: () => {
		return (
			<main>
				<h1>Kitchen Sink</h1>

				<EcoEmbed component={KitaShell} props={{ id: 'kita-root' }}>
					<EcoEmbed component={LitShell} props={{ id: 'kita-lit-child' }}>
						<EcoEmbed component={ReactShell} props={{ id: 'kita-react-child' }}>
							kita-root-child
						</EcoEmbed>
					</EcoEmbed>
				</EcoEmbed>

				<EcoEmbed component={LitShell} props={{ id: 'lit-root' }}>
					<EcoEmbed component={KitaShell} props={{ id: 'lit-kita-child' }}>
						<span data-cross-child="lit-root">lit-root-child</span>
					</EcoEmbed>
				</EcoEmbed>

				<EcoEmbed component={ReactShell} props={{ id: 'react-root' }}>
					react-root-child
				</EcoEmbed>

				<section>
					<h2>Deep React Graph</h2>
					<EcoEmbed component={ReactShell} props={{ id: 'react-deep-root' }}>
						<EcoEmbed component={ReactShell} props={{ id: 'react-deep-middle' }}>
							<EcoEmbed component={ReactShell} props={{ id: 'react-deep-leaf' }}>
								react-deep-child
							</EcoEmbed>
						</EcoEmbed>
					</EcoEmbed>
				</section>

				<section>
					<h2>Counters</h2>
					<KitaCounter />
					<EcoEmbed component={LitCounter} props={{}} />
					<EcoEmbed component={ReactCounter} props={{}} />
				</section>

				<section>
					<h2>MDX</h2>
					<EcoEmbed component={ReactMdxBlock} props={{}} />
				</section>
			</main>
		);
	},
});
