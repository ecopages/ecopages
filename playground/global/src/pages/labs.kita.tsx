import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},

	render: () => {
		return (
			<BaseLayout>
				<div>LABS ROOT TEST</div>
			</BaseLayout>
		);
	},
});
