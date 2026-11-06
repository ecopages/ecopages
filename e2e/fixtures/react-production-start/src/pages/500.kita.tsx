import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import { Counter } from '../components/counter.react';

export default eco.page<ErrorPageTemplateProps>({
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'Server error' }),
	render: () => (
		<main>
			<h1>server-error-page</h1>
			<Counter />
		</main>
	),
});
