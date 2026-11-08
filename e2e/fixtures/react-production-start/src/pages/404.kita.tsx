import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import { Counter } from '../components/counter.react';

export default eco.page<ErrorPageTemplateProps>({
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'Not found' }),
	render: () => (
		<main>
			<h1>not-found-page</h1>
			<Counter />
		</main>
	),
});
