import { eco } from '@ecopages/core';

/**
 * Request-time only demo that always throws a generic Error so `/boom` previews
 * the HTML 500 page. Missing resources should throw `HttpError.NotFound` instead.
 */
export default eco.page({
	cache: 'dynamic',
	render: () => {
		throw new Error('Intentional server error');
	},
});
