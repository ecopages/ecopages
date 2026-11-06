/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { Tiny } from '../components/tiny.eco';
import { Widget } from '../components/widget.eco';

export default eco.page({
	metadata: () => ({ title: 'Two scripts' }),
	dependencies: { components: [Widget, Tiny] },
	render: () => (
		<main>
			<Widget />
			<Tiny />
		</main>
	),
});
