import { describe, expect, it, vi } from 'vitest';
import { readBounded } from './read-bounded';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
	new Request('https://shop.test/api', { method: 'POST', headers, body });

describe('readBounded', () => {
	it('returns the exact bytes of a body within the limit', async () => {
		const bytes = await readBounded(post('{"a":1}'), 16);

		expect(new TextDecoder().decode(bytes ?? undefined)).toBe('{"a":1}');
	});

	it('returns no bytes for a request without a body', async () => {
		expect(await readBounded(new Request('https://shop.test/api', { method: 'POST' }), 16)).toEqual(
			new Uint8Array(),
		);
	});

	it('refuses a Content-Length over the limit without reading the body', async () => {
		const request = post('x'.repeat(32), { 'content-length': '32' });

		expect(await readBounded(request, 16)).toBeNull();
		expect(request.bodyUsed).toBe(false);
	});

	it('stops reading a stream without a Content-Length once it passes the limit', async () => {
		const pull = vi.fn();
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pull();
					controller.enqueue(new Uint8Array(10));
				},
			},
			{ highWaterMark: 0 },
		);
		const request = new Request('https://shop.test/api', { method: 'POST', body, duplex: 'half' } as RequestInit);

		expect(await readBounded(request, 25)).toBeNull();
		expect(pull).toHaveBeenCalledTimes(3);
	});
});
