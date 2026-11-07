import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { SsrOnceLitHost } from '../components/ssr-once-lit-host.kita';

/**
 * A Lit Page that renders a Kita Component declaring an `ssr: true` Lit element script.
 *
 * @remarks
 * The Page renders the element itself as well: Lit server-renders custom elements only in markup it renders, and the
 * Kita Component's markup reaches the document after Lit has rendered.
 */
export default eco.page<{}, EcoPagesElement>({
	cache: 'dynamic',
	integration: 'lit',
	render: () =>
		html`<main>
			<h1>Lit with a Kita Component declaring a Lit element</h1>
			${eco.embed(SsrOnceLitHost)}
			<ssr-once-lit-probe></ssr-once-lit-probe>
		</main>` as unknown as EcoPagesElement,
});
