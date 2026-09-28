import { eco } from '@ecopages/core';
import { DiscoveryCounter } from '@/components/dependency-discovery/counter.lit';

export default eco.page({
	render: () => (
		<main>
			<h1>Inferred foreign child</h1>
			<div style="height:250vh"></div>
			<DiscoveryCounter />
		</main>
	),
});
