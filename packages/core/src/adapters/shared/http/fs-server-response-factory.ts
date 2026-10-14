import { STATUS_MESSAGE } from '../../../config/constants.ts';
import type { RouteRendererBody } from '../../../types/public-types.ts';

/**
 * Builds response envelopes for rendered route and error-page bodies.
 */
export class FileSystemServerResponseFactory {
	async createResponseWithBody(
		body: RouteRendererBody,
		init: ResponseInit = {
			headers: {
				'Content-Type': 'text/html',
			},
		},
	): Promise<Response> {
		return new Response(body as BodyInit, init);
	}

	/** Wraps already-rendered HTML in an error response envelope. */
	async createHtmlErrorResponse(status: number, body: RouteRendererBody): Promise<Response> {
		return await this.createResponseWithBody(body, {
			status,
			statusText: STATUS_MESSAGE[status as keyof typeof STATUS_MESSAGE] ?? String(status),
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	}
}
