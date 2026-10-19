import { describe, expect, it } from 'vitest';
import { HttpError } from '@ecopages/core/errors';
import { fromLitStaticRenderErrorMessage, toLitStaticRenderErrorMessage } from '../lit-static-render-error.ts';

describe('Lit static render worker errors', () => {
	it('keeps the status of an HttpError across the worker boundary', () => {
		const message = toLitStaticRenderErrorMessage(HttpError.NotFound('No such post'), '7');
		const rebuilt = fromLitStaticRenderErrorMessage(structuredClone(message));

		expect(message).toMatchObject({ type: 'error', id: '7', status: 404, message: 'No such post' });
		expect(HttpError.isHttpError(rebuilt)).toBe(true);
		expect(rebuilt).toMatchObject({ status: 404, message: 'No such post' });
		expect(rebuilt.cause).toMatchObject({ name: 'HttpError', message: 'No such post' });
	});

	it('rebuilds other errors as plain errors without a status', () => {
		const message = toLitStaticRenderErrorMessage(new TypeError('boom'));
		const rebuilt = fromLitStaticRenderErrorMessage(message);

		expect(message.status).toBeUndefined();
		expect(HttpError.isHttpError(rebuilt)).toBe(false);
		expect(rebuilt.message).toBe('boom');
		expect(rebuilt.cause).toMatchObject({ name: 'TypeError', message: 'boom' });
	});

	it('reports a thrown non-error value as its string form', () => {
		expect(toLitStaticRenderErrorMessage('nope')).toMatchObject({ type: 'error', message: 'nope' });
	});
});
