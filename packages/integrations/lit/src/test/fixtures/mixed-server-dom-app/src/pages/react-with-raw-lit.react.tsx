import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { SsrOnceLitReactHost } from '../components/ssr-once-lit-host.react';

/** A React Page that writes a Lit element as a raw tag in a React Component declaring its `ssr: true` script. */
export default eco.page<{}, ReactNode>({
	cache: 'dynamic',
	render: () => (
		<main>
			<h1>React with a raw Lit element</h1>
			<SsrOnceLitReactHost />
		</main>
	),
});
