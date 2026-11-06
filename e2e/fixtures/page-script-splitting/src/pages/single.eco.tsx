/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { Widget } from '../components/widget.eco';

export default eco.page({
	metadata: () => ({ title: 'One script' }),
	dependencies: { components: [Widget] },
	render: () => (
		<main>
			<Widget />
		</main>
	),
});
