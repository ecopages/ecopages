import { describe, expect, it } from 'vitest';
import { HttpError } from './http-error.ts';
import {
	classifyPageFailure,
	ERROR_PAGE_KIND_BY_STATUS,
	ERROR_PAGE_STATUS_BY_KIND,
	HTTP_ERROR_PAGE_STATUSES,
	kindForStatus,
	shouldLogPageFailure,
} from './http-error-page-contract.ts';

describe('http error page contract', () => {
	it('maps each factory status to a unique kind and back', () => {
		for (const status of HTTP_ERROR_PAGE_STATUSES) {
			const kind = ERROR_PAGE_KIND_BY_STATUS[status];
			expect(ERROR_PAGE_STATUS_BY_KIND[kind]).toBe(status);
			expect(kindForStatus(status)).toBe(kind);
		}
	});

	it.each([
		[HttpError.BadRequest(), 400, 'badRequest', false],
		[HttpError.Unauthorized(), 401, 'unauthorized', false],
		[HttpError.Forbidden(), 403, 'forbidden', false],
		[HttpError.NotFound(), 404, 'notFound', false],
		[HttpError.Conflict(), 409, 'conflict', false],
		[HttpError.InternalServerError(), 500, 'serverError', true],
	] as const)('classifies %s as HTML %s', (error, status, kind, logAsServerError) => {
		expect(classifyPageFailure(error)).toEqual({ status, kind, logAsServerError });
		expect(shouldLogPageFailure(error)).toBe(logAsServerError);
	});

	it('reuses the server-error page for non-factory 5xx with the original status', () => {
		expect(classifyPageFailure(new HttpError(502, 'Bad Gateway'))).toEqual({
			status: 502,
			kind: 'serverError',
			logAsServerError: true,
		});
	});

	it('uses a built-in document for non-factory 4xx with the original status', () => {
		expect(classifyPageFailure(new HttpError(418, "I'm a teapot"))).toEqual({
			status: 418,
			kind: undefined,
			logAsServerError: false,
		});
	});

	it.each([200, 399, 600, 700, Number.NaN, Number.POSITIVE_INFINITY])(
		'normalizes invalid HttpError status %s to HTML 500',
		(status) => {
			expect(classifyPageFailure(new HttpError(status, 'Invalid status'))).toEqual({
				status: 500,
				kind: 'serverError',
				logAsServerError: true,
			});
		},
	);

	it('classifies generic errors as HTML 500', () => {
		const error = new Error('boom');
		expect(classifyPageFailure(error)).toEqual({
			status: 500,
			kind: 'serverError',
			logAsServerError: true,
		});
	});
});
