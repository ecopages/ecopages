import { createServer, type Server, type ServerResponse } from 'node:http';
import { request } from '@playwright/test';
import { afterEach, describe, expect, it } from 'vitest';
import { requestGetAndWait } from '../../playground/kitchen-sink/e2e/test-support.ts';

type APIRequestContext = Awaited<ReturnType<typeof request.newContext>>;

let server: Server | undefined;
let requestContext: APIRequestContext | undefined;

async function startServer(handler: (response: ServerResponse) => void): Promise<string> {
	const listeningServer = createServer((_request, response) => handler(response));
	server = listeningServer;
	await new Promise<void>((resolve, reject) => {
		listeningServer.once('error', reject);
		listeningServer.listen(0, '127.0.0.1', resolve);
	});

	const address = listeningServer.address();
	if (!address || typeof address === 'string') throw new Error('The test server did not expose a TCP address');

	return `http://127.0.0.1:${address.port}`;
}

async function closeServer(): Promise<void> {
	const activeServer = server;
	if (!activeServer?.listening) return;
	await new Promise<void>((resolve, reject) => {
		activeServer.close((error) => (error ? reject(error) : resolve()));
	});
}

afterEach(async () => {
	await requestContext?.dispose();
	requestContext = undefined;
	await closeServer();
	server = undefined;
});

describe('requestGetAndWait', () => {
	it('fails on the first non-2xx response with its status and a body excerpt', async () => {
		let requestCount = 0;
		const body = 'preview server failed '.repeat(20);
		const href = await startServer((response) => {
			requestCount += 1;
			response.statusCode = 500;
			response.end(body);
		});
		const context = await request.newContext();
		requestContext = context;

		const error = await requestGetAndWait(context, href, 1000).then(
			() => undefined,
			(caught: unknown) => caught,
		);

		if (!(error instanceof Error)) throw new Error('Expected the failed response to reject');
		expect(error.message).toBe(`GET ${href} returned HTTP 500: ${body.slice(0, 300)}`);
		expect(requestCount).toBe(1);
	});

	it('reports a refused connection instead of retrying until the readiness timeout', async () => {
		const href = await startServer(() => undefined);
		await closeServer();
		const context = await request.newContext();
		requestContext = context;

		const error = await requestGetAndWait(context, href, 1000).then(
			() => undefined,
			(caught: unknown) => caught,
		);

		if (!(error instanceof Error)) throw new Error('Expected the refused connection to reject');
		expect(error.message).toMatch(/ECONNREFUSED/);
	});
});
