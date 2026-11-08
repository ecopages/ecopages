import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { SsrOnceLitHost } from '../components/ssr-once-lit-host.kita';

/**
 * A Lit Page that renders a Kita Component declaring an `ssr: true` Lit element script.
 */
export default eco.page<{}, EcoPagesElement>({
	cache: 'dynamic',
	integration: 'lit',
	render: () =>
		html`<main>
			<h1>Lit with a Kita Component declaring a Lit element</h1>
			${eco.embed(SsrOnceLitHost)}
		</main>` as unknown as EcoPagesElement,
});
