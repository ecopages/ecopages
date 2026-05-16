import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import * as litStaticHtml from 'lit/static-html.js';
import { KitaCounter } from '@/components/kita-counter.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactMdxBlock } from '@/components/react-mdx-block.react';
import { KitaShell } from '@ecopages/testing/kitchen-sink/kita-shell';
import { LitShell } from '@ecopages/testing/kitchen-sink/lit-shell';
import { ReactShell } from '@ecopages/testing/kitchen-sink/react-shell';

const html = (litStaticHtml as unknown as {
	html: (strings: TemplateStringsArray, ...values: unknown[]) => EcoPagesElement;
}).html;

export default eco.page<{}, EcoPagesElement>({
	integration: 'lit',
	dependencies: {
		components: [KitaShell, LitShell, ReactShell, KitaCounter, LitCounter, ReactCounter, ReactMdxBlock],
	},
	metadata: () => ({
		title: 'Lit Entry',
		description: 'Lit integration entrypoint for kitchen sink',
	}),
	render: () =>
		html`<main>
			<h1>Lit Entry</h1>
			${eco.embed(
				LitShell,
				{ id: 'lit-entry-root' },
				eco.embed(
					KitaShell,
					{ id: 'lit-entry-kita-child' },
					html`<span data-cross-child="lit-entry">lit-entry-child</span>`,
				),
			)}
			${eco.embed(ReactShell, { id: 'lit-entry-react-child' }, 'lit-entry-react-child')}

			<section>
				<h2>Counters</h2>
				${eco.embed(KitaCounter, {})}
				${eco.embed(LitCounter, {})}
				${eco.embed(ReactCounter, {})}
			</section>

			<section>
				<h2>MDX</h2>
				${eco.embed(ReactMdxBlock, {})}
			</section>
		</main>` as unknown as EcoPagesElement,
});
