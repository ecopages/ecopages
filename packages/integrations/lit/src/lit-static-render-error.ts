import { HttpError } from '@ecopages/core/errors';
import type { LitStaticRenderWorkerErrorMessage } from './lit-static-render-protocol.ts';

/**
 * Turns an error thrown in the Lit worker into the message posted to the main thread.
 *
 * @remarks
 * `postMessage` cannot carry an `Error` with its class, so the status of an `HttpError` travels as a field.
 * Without it a page that throws `HttpError.NotFound()` would reach the main thread as a plain error and render as a 500.
 */
export function toLitStaticRenderErrorMessage(error: unknown, id?: string): LitStaticRenderWorkerErrorMessage {
	if (!(error instanceof Error) && !HttpError.isHttpError(error)) {
		return { type: 'error', id, message: String(error) };
	}

	const { message, name, stack } = error;
	return {
		type: 'error',
		id,
		message,
		name,
		stack,
		status: HttpError.isHttpError(error) ? error.status : undefined,
	};
}

/**
 * Rebuilds the error a Lit worker reported, as an `HttpError` when the worker's error carried a status.
 *
 * @remarks
 * The worker-side name, message and stack are kept on `cause` because the rebuilt error's own stack points at the
 * message handler, not at the page that threw.
 */
export function fromLitStaticRenderErrorMessage(message: LitStaticRenderWorkerErrorMessage): Error {
	const error =
		message.status === undefined ? new Error(message.message) : new HttpError(message.status, message.message);
	error.cause = { name: message.name, message: message.message, stack: message.stack };
	return error;
}
