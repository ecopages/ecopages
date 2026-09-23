import { eco } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';

/**
 * Request-time demo that throws `HttpError.Forbidden` so `/forbidden` previews
 * HTML 403. Missing resources should throw `HttpError.NotFound` instead.
 */
export default eco.page({
	cache: 'dynamic',
	render: () => {
		throw HttpError.Forbidden('Admin only');
	},
});
