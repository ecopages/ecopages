import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TrustProxy } from '../../config/user-config-types.ts';

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
 * The first value of a header that may carry a comma separated list, trimmed, or `undefined` when it is empty.
 */
function firstHeaderValue(value: string | string[] | undefined): string | undefined {
	const first = (Array.isArray(value) ? value[0] : value)?.split(',', 1)[0]?.trim();
	return first || undefined;
}

/**
 * The origin a request's URL carries: the `Host` the visitor sent, or the listen origin when there is none.
 * Shared by the HTTP bridge and the WebSocket upgrade, so both give a handler the same origin.
 *
 * @remarks
 * A host that is not a plain authority (a path, credentials, whitespace) is ignored rather than refused, so a
 * malformed header cannot change the origin the app sees. `X-Forwarded-Host` and `X-Forwarded-Proto` replace the
 * host and the protocol only where `trustProxy` names them: any client can send them, so an app that does not sit behind its
 * own proxy must not read them. The protocol is `http` or `https`, the listen origin's protocol by default.
 */
export function resolveRequestOrigin(
	req: IncomingMessage,
	runtimeOrigin: string,
	trustProxy: TrustProxy | undefined,
): string {
	return pickRequestOrigin(req, runtimeOrigin, trustProxy).origin;
}

/**
 * The hostname the request URL carries, or `null` when the request names no usable host.
 *
 * @remarks
 * This is the value the host policy checks, read from the same header {@link resolveRequestOrigin} uses, so the
 * host that was checked is the host `request.url` has. A missing or malformed `Host` gives `null`, not the listen
 * hostname: the policy refuses a request that does not say where it is going.
 */
export function resolveRequestHostname(
	req: IncomingMessage,
	runtimeOrigin: string,
	trustProxy: TrustProxy | undefined,
): string | null {
	const { origin, fromHeader } = pickRequestOrigin(req, runtimeOrigin, trustProxy);
	return fromHeader ? new URL(origin).hostname : null;
}

/**
 * The URL of a Node request on `origin`, taking only the path and query from the request target.
 *
 * @remarks
 * The target is not resolved with `new URL(target, origin)`: a target such as `//evil.example/x` or the absolute
 * form `http://evil.example/x` would replace the host the policy checked. The path and query are appended to the
 * origin instead, so the URL always carries the host that was checked.
 */
export function requestUrlOnOrigin(target: string | undefined, origin: string): URL {
	const value = target ?? '/';
	if (value.startsWith('/')) return new URL(`${origin}${value}`);
	try {
		const absolute = new URL(value);
		return new URL(`${origin}${absolute.pathname}${absolute.search}`);
	} catch {
		return new URL(`${origin}/`);
	}
}

/**
 * The origin the request names, and whether a header gave it or the listen origin stands in for a missing one.
 */
function pickRequestOrigin(
	req: IncomingMessage,
	runtimeOrigin: string,
	trustProxy: TrustProxy | undefined,
): { origin: string; fromHeader: boolean } {
	const trusted = typeof trustProxy === 'object' ? trustProxy : { host: trustProxy, proto: trustProxy };
	const fallback = new URL(runtimeOrigin);
	const forwardedProto = trusted.proto
		? firstHeaderValue(req.headers['x-forwarded-proto'])?.toLowerCase()
		: undefined;
	const protocol = forwardedProto === 'http' || forwardedProto === 'https' ? `${forwardedProto}:` : fallback.protocol;
	const hosts = [
		trusted.host ? firstHeaderValue(req.headers['x-forwarded-host']) : undefined,
		req.headers.host?.trim(),
	];
	for (const host of hosts) {
		const origin = host ? originOfAuthority(protocol, host) : null;
		if (origin) return { origin, fromHeader: true };
	}
	return { origin: `${protocol}//${fallback.host}`, fromHeader: false };
}

/**
 * The origin of `protocol` and `host`, or `null` when `host` is not a plain authority (a hostname or address with an
 * optional port).
 */
function originOfAuthority(protocol: string, host: string): string | null {
	if (/[\s,/?#@\\]/u.test(host)) return null;
	try {
		const candidate = new URL(`${protocol}//${host}`);
		return candidate.host === '' ? null : candidate.origin;
	} catch {
		return null;
	}
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
	 * Requests with body framing retain streaming semantics via a `ReadableStream`
	 * so large request bodies do not need to be buffered before route handling begins.
	 * The Node request is paused once a chunk is queued and resumed as the body is read, so a handler that waits
	 * before it reads, such as one behind slow middleware, does not make the server queue the whole upload.
	 *
	 * The request URL carries the origin the visitor used: the `Host` header, or the forwarded headers
	 * when `trustProxy` is set, and `runtimeOrigin` only when neither is usable.
	 */
	public createWebRequest(
		req: IncomingMessage,
		runtimeOrigin: string,
		options: { trustProxy?: TrustProxy } = {},
	): Request {
		const url = requestUrlOnOrigin(req.url, resolveRequestOrigin(req, runtimeOrigin, options.trustProxy));
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

		const hasBodyFraming =
			req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0;
		if (method !== 'GET' && method !== 'HEAD' && hasBodyFraming) {
			let cancelled = false;
			let settled = false;
			let onData: ((chunk: Buffer) => void) | undefined;
			const body = new ReadableStream({
				start(controller) {
					const dataListener = (chunk: Buffer) => {
						if (cancelled) return;
						controller.enqueue(chunk);
						if ((controller.desiredSize ?? 1) <= 0) req.pause();
					};
					const onEnd = () => {
						cleanup();
						if (cancelled || settled) return;
						settled = true;
						controller.close();
					};
					const onAborted = () => {
						req.off('data', dataListener);
						req.off('end', onEnd);
						req.off('aborted', onAborted);
						if (cancelled || settled) return;
						settled = true;
						controller.error(new NodeClientAbortError());
					};
					const onError = (err: Error) => {
						cleanup();
						if (cancelled || settled) return;
						settled = true;
						const isClientAbort = (err as NodeJS.ErrnoException).code === 'ECONNRESET';
						controller.error(isClientAbort ? new NodeClientAbortError() : err);
					};
					const onClose = () => cleanup();
					const cleanup = () => {
						req.off('data', dataListener);
						req.off('end', onEnd);
						req.off('aborted', onAborted);
						req.off('error', onError);
						req.off('close', onClose);
					};
					onData = dataListener;
					req.on('data', dataListener);
					req.once('end', onEnd);
					req.once('aborted', onAborted);
					req.once('error', onError);
					req.once('close', onClose);
				},
				pull() {
					req.resume();
				},
				cancel() {
					cancelled = true;
					if (onData) req.off('data', onData);
					req.resume();
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
	 *
	 * `Headers.forEach` yields every `Set-Cookie` value as a separate entry, so
	 * writing them one by one would let each overwrite the previous. They are
	 * collected with `getSetCookie()` and written as a single array value.
	 */
	public async sendNodeResponse(res: ServerResponse, response: Response): Promise<void> {
		res.statusCode = response.status;

		response.headers.forEach((value, key) => {
			if (key !== 'set-cookie') res.setHeader(key, value);
		});

		const setCookies = response.headers.getSetCookie();
		if (setCookies.length > 0) res.setHeader('set-cookie', setCookies);

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
