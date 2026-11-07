import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'dynamic',

	render: ({ params, query }) => (
		<div>
			<h1 safe>
				Catch All {JSON.stringify(params || [])} {JSON.stringify(query || [])}
			</h1>
		</div>
	),
});
