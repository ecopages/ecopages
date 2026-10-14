import { eco } from '@ecopages/core';
import { waitForPeerStaticRender } from '@/lib/static-render-barrier';

export default eco.page({
	render: async () => {
		const peakConcurrentRenders = await waitForPeerStaticRender();
		return (
			<main data-testid="static-concurrency-page" data-peak-concurrent-renders={peakConcurrentRenders}>
				First page
			</main>
		);
	},
});
