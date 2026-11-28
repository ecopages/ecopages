import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { TrustProxy } from '../../config/user-config-types.ts';
import { NodeClientAbortError, NodeHttpRequestBridge, resolveRequestHostname } from './http-request-bridge.ts';

class MockIncomingMessage extends PassThrough {
	public url = '/submit?ok=1';
	public method = 'POST';
	public headers: Record<string, string | string[] | undefined> = {
		'content-type': 'application/json',
		'content-length': '17',
		'x-test': 'one',
	};

	public emitAbort(): void {
		this.emit('aborted');
	}

	public emitNodeError(code: string): void {
		const error = new Error(code) as NodeJS.ErrnoException;
		error.code = code;
		this.emit('error', error);
	}
}

/**
 * Writable test double that captures streamed response output and headers for
 * bridge assertions.
 */
class MockServerResponse extends Writable {
	public statusCode = 200;
	public headers = new Map<string, string>();
	public chunks: Buffer[] = [];

	public setHeader(name: string, value: string): void {
		this.headers.set(name, value);
	}

	public override _write(
		chunk: string | Buffer,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		callback();
	}
}

describe('NodeHttpRequestBridge', () => {
	it('creates a streaming Web Request for non-GET request bodies', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');
		const bodyRead = request.text();

		req.end('{"hello":"world"}');

		expect(request.method).toBe('POST');
		expect(request.url).toBe('http://localhost:3000/submit?ok=1');
		expect(request.headers.get('content-type')).toBe('application/json');
		expect(request.headers.get('x-test')).toBe('one');
		await expect(bodyRead).resolves.toBe('{"hello":"world"}');
	});

	describe('request origin', () => {
		const requestUrl = (
			headers: Record<string, string | string[] | undefined>,
			options?: { trustProxy?: TrustProxy },
			url = '/submit?ok=1',
		) => {
			const req = new MockIncomingMessage();
			req.method = 'GET';
			req.url = url;
			req.headers = headers;
			return new NodeHttpRequestBridge().createWebRequest(
				req as unknown as IncomingMessage,
				'http://127.0.0.1:3000',
				options,
			).url;
		};

		it('uses the Host the visitor sent, with its port', () => {
			expect(requestUrl({ host: 'shop.example' })).toBe('http://shop.example/submit?ok=1');
			expect(requestUrl({ host: 'shop.example:8080' })).toBe('http://shop.example:8080/submit?ok=1');
			expect(requestUrl({ host: '[::1]:3000' })).toBe('http://[::1]:3000/submit?ok=1');
		});

		it('falls back to the listen origin when Host is missing or not a host', () => {
			for (const host of [undefined, '', 'evil.example/path', 'user@evil.example', 'a b', 'evil.example#x']) {
				expect(requestUrl({ host })).toBe('http://127.0.0.1:3000/submit?ok=1');
			}
		});

		it('treats a Host that is a list as not a host', () => {
			expect(requestUrl({ host: 'a.example,evil.example' })).toBe('http://127.0.0.1:3000/submit?ok=1');
			expect(requestUrl({ host: 'shop.example:99999' })).toBe('http://127.0.0.1:3000/submit?ok=1');
		});

		it('keeps a forwarded protocol when no host is usable', () => {
			expect(requestUrl({ 'x-forwarded-proto': 'https' }, { trustProxy: true })).toBe(
				'https://127.0.0.1:3000/submit?ok=1',
			);
		});

		it('ignores forwarded headers unless the app trusts its proxy', () => {
			const headers = { host: 'internal:3000', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' };

			expect(requestUrl(headers)).toBe('http://internal:3000/submit?ok=1');
			expect(requestUrl(headers, { trustProxy: false })).toBe('http://internal:3000/submit?ok=1');
		});

		it('trusts only the forwarded protocol, or only the forwarded host, when the app asks for one', () => {
			const headers = { host: 'app.internal', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' };

			expect(requestUrl(headers, { trustProxy: { proto: true } })).toBe('https://app.internal/submit?ok=1');
			expect(requestUrl(headers, { trustProxy: { host: true } })).toBe('http://evil.example/submit?ok=1');
			expect(requestUrl(headers, { trustProxy: { host: true, proto: true } })).toBe(
				'https://evil.example/submit?ok=1',
			);
			expect(requestUrl(headers, { trustProxy: {} })).toBe('http://app.internal/submit?ok=1');
			expect(requestUrl(headers, { trustProxy: { host: false, proto: false } })).toBe(
				'http://app.internal/submit?ok=1',
			);
		});

		it('reads the first forwarded host and a known protocol when the app trusts its proxy', () => {
			const trust = { trustProxy: true };

			expect(
				requestUrl(
					{
						host: 'internal:3000',
						'x-forwarded-host': 'shop.example, proxy.local',
						'x-forwarded-proto': 'https',
					},
					trust,
				),
			).toBe('https://shop.example/submit?ok=1');
			expect(requestUrl({ host: 'internal:3000', 'x-forwarded-host': 'shop.example' }, trust)).toBe(
				'http://shop.example/submit?ok=1',
			);
			expect(requestUrl({ host: 'internal:3000', 'x-forwarded-proto': 'ftp' }, trust)).toBe(
				'http://internal:3000/submit?ok=1',
			);
			expect(requestUrl({ host: 'internal:3000', 'x-forwarded-host': 'bad host' }, trust)).toBe(
				'http://internal:3000/submit?ok=1',
			);
		});

		it('keeps the host that was checked when the request target names another host', () => {
			const headers = { host: 'shop.example' };

			expect(requestUrl(headers, undefined, '//evil.example/x?a=1')).toBe(
				'http://shop.example//evil.example/x?a=1',
			);
			expect(requestUrl(headers, undefined, 'http://evil.example/x?a=1')).toBe('http://shop.example/x?a=1');
			expect(requestUrl(headers, undefined, 'https://evil.example')).toBe('http://shop.example/');
			expect(requestUrl(headers, undefined, '*')).toBe('http://shop.example/');
			expect(requestUrl(headers, undefined, 'foo:@evil.example/x')).toBe('http://shop.example/');
			expect(requestUrl(headers, undefined, 'x:.evil.example/')).toBe('http://shop.example/');
		});
	});

	describe('request hostname', () => {
		const hostname = (headers: Record<string, string | string[] | undefined>, trustProxy?: TrustProxy) =>
			resolveRequestHostname({ headers } as unknown as IncomingMessage, 'http://127.0.0.1:3000', trustProxy);

		it('is the hostname of the Host the visitor sent, without its port', () => {
			expect(hostname({ host: 'Shop.Example:8080' })).toBe('shop.example');
			expect(hostname({ host: '[::1]:3000' })).toBe('[::1]');
		});

		it('is null when Host is missing or not a host, instead of the listen hostname', () => {
			for (const host of [
				undefined,
				'',
				'evil.example/path',
				'user@evil.example',
				'a b',
				'a.example,b.example',
			]) {
				expect(hostname({ host })).toBeNull();
			}
		});

		it('reads a forwarded host only when the app trusts its proxy', () => {
			const headers = { host: 'internal:3000', 'x-forwarded-host': 'shop.example' };

			expect(hostname(headers)).toBe('internal');
			expect(hostname(headers, false)).toBe('internal');
			expect(hostname(headers, { proto: true })).toBe('internal');
			expect(hostname(headers, true)).toBe('shop.example');
			expect(hostname(headers, { host: true })).toBe('shop.example');
		});

		it('falls through to Host when a trusted forwarded host is not a host', () => {
			expect(hostname({ host: 'internal', 'x-forwarded-host': 'bad host' }, true)).toBe('internal');
		});
	});

	it('pauses the Node request while no one reads the body, and resumes it as the body is read', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');

		req.write('a'.repeat(1024));
		await new Promise((resolve) => setImmediate(resolve));
		expect(req.isPaused()).toBe(true);

		const reader = request.body!.getReader();
		await reader.read();
		await new Promise((resolve) => setImmediate(resolve));
		expect(req.isPaused()).toBe(false);
		await reader.cancel();
	});

	it('does not attach a body for GET requests', () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		req.method = 'GET';

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');

		expect(request.method).toBe('GET');
		expect(request.body).toBeNull();
	});

	it('does not attach a body stream when the request has no body framing', () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		req.headers = { 'content-type': 'application/json' };

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');

		expect(request.body).toBeNull();
	});

	it('does not attach a body stream when content length is zero', () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		req.headers = { 'content-length': '0' };

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');

		expect(request.body).toBeNull();
	});

	it('drains a cancelled request body without destroying the request', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');

		await request.body?.cancel();

		expect(req.destroyed).toBe(false);
		req.end('discarded');
	});

	it('normalizes aborted request bodies into NodeClientAbortError', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');
		const bodyRead = request.text();

		req.emitAbort();

		await expect(bodyRead).rejects.toBeInstanceOf(NodeClientAbortError);
	});

	it('handles ECONNRESET after an aborted request event', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');
		const bodyRead = request.text();

		req.emitAbort();
		req.emitNodeError('ECONNRESET');

		await expect(bodyRead).rejects.toBeInstanceOf(NodeClientAbortError);
		expect(req.listenerCount('error')).toBe(0);
	});

	it('normalizes ECONNRESET request stream errors into NodeClientAbortError', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');
		const bodyRead = request.text();

		req.emitNodeError('ECONNRESET');

		await expect(bodyRead).rejects.toBeInstanceOf(NodeClientAbortError);
	});

	it('streams response bodies to the Node response without buffering through arrayBuffer', async () => {
		const bridge = new NodeHttpRequestBridge();
		const response = new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('hello '));
					controller.enqueue(new TextEncoder().encode('world'));
					controller.close();
				},
			}),
			{
				status: 206,
				headers: {
					'content-type': 'text/plain; charset=utf-8',
				},
			},
		);

		const arrayBufferSpy = vi.spyOn(response, 'arrayBuffer');
		const res = new MockServerResponse();

		await bridge.sendNodeResponse(res as unknown as ServerResponse, response);

		expect(res.statusCode).toBe(206);
		expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(Buffer.concat(res.chunks).toString('utf8')).toBe('hello world');
		expect(arrayBufferSpy).not.toHaveBeenCalled();
	});

	it('normalizes closed response streams into NodeClientAbortError', async () => {
		const bridge = new NodeHttpRequestBridge();
		const response = new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('hello world'));
					controller.close();
				},
			}),
		);
		const res = new MockServerResponse();
		res.destroy();

		await expect(bridge.sendNodeResponse(res as unknown as ServerResponse, response)).rejects.toBeInstanceOf(
			NodeClientAbortError,
		);
	});

	it('delivers every Set-Cookie header through a real HTTP round trip', async () => {
		const bridge = new NodeHttpRequestBridge();
		const server = createServer((_req, res) => {
			const headers = new Headers({ 'content-type': 'text/plain' });
			headers.append('set-cookie', 'session=abc; Path=/; HttpOnly');
			headers.append('set-cookie', 'csrf=xyz; Path=/');
			void bridge.sendNodeResponse(res, new Response('ok', { headers }));
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

		try {
			const { port } = server.address() as AddressInfo;
			const received = await new Promise<IncomingMessage>((resolve, reject) => {
				httpRequest({ host: '127.0.0.1', port }, (res) => {
					res.resume();
					res.on('end', () => resolve(res));
				})
					.on('error', reject)
					.end();
			});

			expect(received.headers['content-type']).toBe('text/plain');
			expect(received.headers['set-cookie']).toEqual(['session=abc; Path=/; HttpOnly', 'csrf=xyz; Path=/']);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
