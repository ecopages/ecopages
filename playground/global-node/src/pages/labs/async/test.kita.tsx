import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},

	render: async () => {
		return (
			<BaseLayout>
				<div class="banner">
					<h1 class="banner__title">Proper scaffolding test on build</h1>
					<p>This is a simple example to be sure files are constructed properly on dist build</p>
					<p>
						The <code>test.html</code> file should be in the <code>async</code> directory that should
						include also the <code>index.html</code>
					</p>
				</div>
			</BaseLayout>
		);
	},
});
