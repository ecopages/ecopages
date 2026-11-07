import { eco } from '@ecopages/core';
import { Badge } from '../components/badge';
import { Counter } from '../components/counter';
import { PlainLayout } from '../layouts/plain-layout';

export default eco.page({
	layout: PlainLayout,
	metadata: () => ({
		title: 'Components and layouts',
		description: 'A plain layout, a plain function and a component.',
	}),
	render: () => (
		<main>
			<h1>
				Components <Badge>plain</Badge>
			</h1>
			<Counter />
		</main>
	),
});
