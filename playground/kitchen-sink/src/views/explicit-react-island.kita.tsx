import { eco } from '@ecopages/core';
import { ReactCounter } from '@/components/react-counter.react';

export default eco.page({
	integration: 'kitajs',
	dependencies: {
		components: [ReactCounter],
	},
	metadata: () => ({
		title: 'Explicit React island',
		description: 'A Kita explicit view that renders a React counter island.',
	}),
	render: () => (
		<section data-testid="page-explicit-react-island">
			<ReactCounter />
		</section>
	),
});
