import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Signals that the remote client closed the HTTP exchange before the Node
 * adapter finished reading or writing the body.
 *
 * @remarks
 * This error represents a transport-level disconnect, not an application
 * failure. Higher layers may safely suppress logging for this error when the
 * client socket is already gone and no meaningful response can still be sent.
 */
export class NodeClientAbortError extends Error {
	/**
	 * Creates the canonical Node transport abort error used across request-body
	 * reads and response-body writes.
	 */
	constructor() {
		super('Client closed the request');
		this.name = 'ClientAbortError';
	}
}

/**
 * Returns whether a Node stream error code corresponds to a normal client-side
 * disconnect rather than a server fault.
 *
 * @remarks
 * The allowlist is intentionally narrow. Only socket and stream shutdown codes
 * that are expected after browser aborts or navigation churn are treated as
 * suppressible client disconnects.
 */
function isNodeClientDisconnectCode(code: string | undefined): boolean {
	return [
		'ECONNRESET',
		'EPIPE',
		'ERR_STREAM_DESTROYED',
		'ERR_STREAM_PREMATURE_CLOSE',
		'ERR_STREAM_UNABLE_TO_PIPE',
	].includes(code ?? '');
}

/**
 * Type guard for the canonical client-abort error used by the Node adapter.
 *
 * @remarks
 * Runtime hosts use this guard before logging so only explicitly classified
 * client disconnects are muted. All other failures continue through the normal
 * error-reporting path.
 */
export function isNodeClientAbortError(error: unknown): error is NodeClientAbortError {
	return error instanceof NodeClientAbortError;
}

/**
 * Normalizes low-level Node socket and stream shutdown errors into the shared
 * `NodeClientAbortError` abstraction used by the adapter stack.
 *
 * @remarks
 * This normalization exists at the transport boundary because Node exposes
 * several host-specific error codes for the same underlying event: the client
 * disappeared before the response stream finished. Converting them here keeps
 * the rest of the adapter stack independent from those Node-specific details.
 */
function toNodeClientAbortError(error: unknown): NodeClientAbortError | null {
	if (error instanceof NodeClientAbortError) {
		return error;
	}

	if (typeof error === 'object' && error !== null && 'code' in error) {
		const code = typeof error.code === 'string' ? error.code : undefined;
		if (isNodeClientDisconnectCode(code)) {
			return new NodeClientAbortError();
		}
	}

	return null;
}

/**
 * Bridges Node's `IncomingMessage` / `ServerResponse` pair to the Web
 * `Request` / `Response` contract used by the shared routing pipeline.
 *
 * @remarks
 * This class is the Node transport boundary. It owns the translation of request
 * headers and bodies into Web primitives and the reverse translation of Web
 * responses back onto Node streams, including client-abort normalization.
 */
export class NodeHttpRequestBridge {
	/**
	 * Converts one incoming Node request into the Web `Request` shape consumed by
	 * the shared server adapter.
	 *
	 * @remarks
	 * Non-GET/HEAD requests retain streaming semantics via a `ReadableStream` so
	 * large request bodies do not need to be buffered before route handling begins.
	 */
	public createWebRequest(req: IncomingMessage, runtimeOrigin: string): Request {
		const url = new URL(req.url ?? '/', runtimeOrigin);
		const headers = new Headers();

		for (const [key, value] of Object.entries(req.headers)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					headers.append(key, item);
				}
				continue;
			}

			if (value !== undefined) {
				headers.set(key, value);
			}
		}

		const method = (req.method ?? 'GET').toUpperCase();
		const requestInit: RequestInit & { duplex?: 'half' } = {
			method,
			headers,
		};

		if (method !== 'GET' && method !== 'HEAD') {
			const body = new ReadableStream({
				start(controller) {
					req.on('data', (chunk: Buffer) => controller.enqueue(chunk));
					req.once('end', () => controller.close());
					req.once('aborted', () => {
						controller.error(new NodeClientAbortError());
					});
					req.once('error', (err) => {
						const isClientAbort = (err as NodeJS.ErrnoException).code === 'ECONNRESET';
						controller.error(isClientAbort ? new NodeClientAbortError() : err);
					});
				},
				cancel() {
					req.destroy();
				},
			});

			requestInit.body = body;
			requestInit.duplex = 'half';
		}

		return new Request(url, requestInit);
	}

	/**
	 * Sends a Web `Response` through Node's `ServerResponse` without buffering the
	 * full body in memory first.
	 *
	 * @remarks
	 * Streaming responses matter for large payloads and long-lived transports such
	 * as server-sent events. The bridge therefore forwards the `ReadableStream`
	 * directly into the Node writable response instead of materializing an
	 * intermediate `ArrayBuffer`.
	 */
	public async sendNodeResponse(res: ServerResponse, response: Response): Promise<void> {
		res.statusCode = response.status;

		response.headers.forEach((value, key) => {
			res.setHeader(key, value);
		});

		if (!response.body) {
			res.end();
			return;
		}

		const responseBody = response.body as unknown as Parameters<typeof Readable.fromWeb>[0];
		try {
			await pipeline(Readable.fromWeb(responseBody), res);
		} catch (error) {
			throw toNodeClientAbortError(error) ?? error;
		}
	}
}
