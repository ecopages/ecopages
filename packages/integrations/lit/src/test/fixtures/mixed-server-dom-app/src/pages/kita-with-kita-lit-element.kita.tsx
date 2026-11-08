import { eco } from '@ecopages/core';
import { SsrOnceLitHost } from '../components/ssr-once-lit-host.kita';

/** A Kita Page that renders a Kita Component declaring an `ssr: true` Lit element script. */
export default eco.page({
	cache: 'dynamic',
	render: () => (
		<main>
			<h1>Kita with a Kita Component declaring a Lit element</h1>
			<SsrOnceLitHost />
		</main>
	),
});
