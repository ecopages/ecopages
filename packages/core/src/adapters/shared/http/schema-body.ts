import { isNodeClientAbortError } from '../../node/http-request-bridge.ts';
import { groupRepeatedKeys } from '../../../router/server/parse-search-params.ts';

/**
 * What reading the body of a route with `schema.body` gives: the value to validate, or the HTTP status and message
 * the request is refused with.
 */
export type SchemaBodyResult = { value: unknown } | { status: 400 | 413 | 415; error: string };

type BodyParser = (request: Request) => Promise<unknown>;

/**
 * Thrown into the body stream of a schema body that grows past the limit, so the parser that reads it rejects.
 */
class BodyTooLargeError extends Error {
	constructor() {
		super('The request body is larger than the limit.');
	}
}

const isBodyTooLarge = (error: unknown): boolean =>
	error instanceof BodyTooLargeError || (error instanceof Error && error.cause instanceof BodyTooLargeError);

/**
 * A copy of the request whose body fails with {@link BodyTooLargeError} once it passes `limit` bytes.
 *
 * @remarks
 * It always reads a clone of the body, so the handler can still read the original request. A request without a
 * body is returned as it is.
 */
function limitBody(request: Request, limit: number): Request {
	if (request.body === null) return request;
	const body = request.clone().body!;
	if (limit === Number.POSITIVE_INFINITY) return new Request(request.url, bodyInit(request, body));

	let received = 0;
	const counter = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength;
			if (received > limit) throw new BodyTooLargeError();
			controller.enqueue(chunk);
		},
	});
	return new Request(request.url, bodyInit(request, body.pipeThrough(counter)));
}

function bodyInit(request: Request, body: ReadableStream<Uint8Array>): RequestInit & { duplex: 'half' } {
	return { method: request.method, headers: request.headers, body, duplex: 'half' };
}

const parseTextBody = async (request: Request): Promise<string | undefined> => {
	if (request.body === null) return undefined;
	const text = await request.text();
	return text.length === 0 ? undefined : text;
};

const parseFormBody: BodyParser = async (request) =>
	request.body === null ? {} : groupRepeatedKeys(await request.formData());

/**
 * The content types a body schema reads, each with the parser that turns the request into the value to
 * validate. A parser receives a request it may consume, so the handler can still read the original.
 */
const bodyParsers: ReadonlyMap<string, BodyParser> = new Map([
	['text/plain', parseTextBody],
	[
		'application/json',
		async (request) => {
			const text = await parseTextBody(request);
			return text === undefined ? undefined : JSON.parse(text);
		},
	],
	['application/x-www-form-urlencoded', parseFormBody],
	['multipart/form-data', parseFormBody],
]);

const refusal = (status: 400 | 413 | 415, error: string): SchemaBodyResult => ({ status, error });

/**
 * Cancels the original body without waiting for it.
 *
 * @remarks
 * A cancelled `tee` branch settles only once every other branch is cancelled or read, so awaiting it could hang
 * on a clone a middleware kept for later.
 */
function discardBody(request: Request): void {
	void request.body?.cancel().catch(() => undefined);
}

/**
 * Whether the request carries any body byte, reading no more than the first chunk and cancelling the rest.
 */
async function hasBodyContent(request: Request): Promise<boolean> {
	const body = request.clone().body;
	if (!body) return false;
	const reader = body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return false;
			if (value.byteLength === 0) continue;
			discardBody(request);
			void reader.cancel().catch(() => undefined);
			return true;
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Reads the body of a request for `schema.body`.
 *
 * @remarks
 * A declared `Content-Length` over `limit` is refused with 413 without reading anything, and a body without one is
 * counted as it streams and refused once it passes `limit`, so no more than the limit is buffered. A body without a
 * `Content-Type` is refused with 415 when it holds a byte, and a malformed one with 400. A refused body is cancelled.
 * The original request is never consumed: a middleware that read it first is a programming error and throws.
 */
export async function readSchemaBody(request: Request, limit: number): Promise<SchemaBodyResult> {
	if (request.bodyUsed || request.body?.locked) {
		throw new Error(
			'The request body was read before the schema body could be. Read request.clone() in middleware, so the body stays available.',
		);
	}

	const tooLarge = () => {
		discardBody(request);
		return refusal(413, 'Payload Too Large');
	};
	if (Number(request.headers.get('content-length')) > limit) return tooLarge();

	const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() || '';
	try {
		if (!contentType) {
			if (!(await hasBodyContent(request))) return { value: undefined };
			return refusal(415, 'Unsupported Media Type');
		}

		const parseBody = bodyParsers.get(contentType);
		if (!parseBody) {
			discardBody(request);
			return refusal(415, 'Unsupported Media Type');
		}
		return { value: await parseBody(limitBody(request, limit)) };
	} catch (error) {
		if (isNodeClientAbortError(error)) throw error;
		if (isBodyTooLarge(error)) return tooLarge();
		return refusal(400, 'Invalid request body');
	}
}
