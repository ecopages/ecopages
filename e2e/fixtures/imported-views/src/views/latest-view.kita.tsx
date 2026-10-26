import { eco } from '@ecopages/core';
import { Badge } from '../components/badge.kita';

export default eco.page({
	metadata: () => ({ title: 'Latest' }),
	render: () => (
		<section>
			<h1>Version 1</h1>
			<Badge />
		</section>
	),
});
