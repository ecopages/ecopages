/**
 * Reads a request body, or `null` as soon as it holds more than `limit` bytes, so a client cannot make the server
 * buffer more by streaming without a `Content-Length`.
 *
 * @remarks
 * Routes that parse a body use `schema.body`, which Ecopages bounds with `maxRequestBodySize`. This reader is for
 * the two that need the exact bytes the client sent and a limit below that default: the Shopify webhook, whose
 * signature covers the raw body, and the UCP proxy, which forwards the body unchanged.
 */
export async function readBounded(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
	if (Number(request.headers.get('content-length')) > limit) return null;
	const reader = request.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
		total += chunk.value.byteLength;
		if (total > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(chunk.value);
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}
