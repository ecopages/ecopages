import type { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { NodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';

class MockIncomingMessage extends PassThrough {
	public url = '/submit?ok=1';
	public method = 'POST';
	public headers: Record<string, string | string[] | undefined> = {
		'content-type': 'application/json',
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

	it('does not attach a body for GET requests', () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();
		req.method = 'GET';

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');

		expect(request.method).toBe('GET');
		expect(request.body).toBeNull();
	});

	it('normalizes aborted request bodies into NodeClientAbortError', async () => {
		const bridge = new NodeHttpRequestBridge();
		const req = new MockIncomingMessage();

		const request = bridge.createWebRequest(req as unknown as IncomingMessage, 'http://localhost:3000');
		const bodyRead = request.text();

		req.emitAbort();

		await expect(bodyRead).rejects.toBeInstanceOf(NodeClientAbortError);
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
});
