import { describe, expect, it, vi } from 'vitest';
import { ApiRequestPipeline, compileApiRoutes } from '../adapters/shared/http/api-request-pipeline.ts';
import { runMiddlewareChain } from '../adapters/shared/http/run-middleware-chain.ts';
import type { RenderContext } from '../types/contracts.ts';
import { flattenMiddleware } from './create-middleware.ts';
import { sameOrigin } from './same-origin.ts';

type TestContext = { readonly locals: Record<string, unknown>; readonly request: Request };

const ORIGIN = 'https://shop.example';

function post(headers: Record<string, string>, method = 'POST', body?: BodyInit): Request {
	return new Request(`${ORIGIN}/api/cart`, { method, headers, body });
}

async function run(request: Request, options?: Parameters<typeof sameOrigin>[0]) {
	const terminal = vi.fn(async () => new Response('done'));
	const response = await runMiddlewareChain(
		flattenMiddleware<TestContext>([sameOrigin(options)]),
		{ locals: {}, request },
		terminal,
	);
	return { response, reached: terminal.mock.calls.length > 0 };
}

describe('sameOrigin', () => {
	describe('Sec-Fetch-Site', () => {
		it.each([
			['same-origin', true],
			['none', true],
			['same-site', false],
			['cross-site', false],
			['unknown-value', false],
			['', false],
		])('on a POST with %j the handler runs: %s', async (site, allowed) => {
			const { response, reached } = await run(post({ 'sec-fetch-site': site }));

			expect(reached).toBe(allowed);
			expect(response.status).toBe(allowed ? 200 : 403);
		});

		it('trusts Sec-Fetch-Site over a foreign Origin, which a browser cannot send with it', async () => {
			const { reached } = await run(post({ 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' }));

			expect(reached).toBe(true);
		});

		it('refuses a cross-site request even when its Origin matches', async () => {
			const { reached } = await run(post({ 'sec-fetch-site': 'cross-site', origin: ORIGIN }));

			expect(reached).toBe(false);
		});
	});

	describe('Origin fallback, when Sec-Fetch-Site is absent', () => {
		it('allows an Origin equal to the request origin', async () => {
			expect((await run(post({ origin: ORIGIN }))).reached).toBe(true);
		});

		it.each([
			['another host', 'https://evil.example'],
			['a sibling subdomain', 'https://app.shop.example'],
			['another port', 'https://shop.example:8443'],
			['another protocol', 'http://shop.example'],
			['the null origin', 'null'],
			['an empty value', ''],
			['a list', `${ORIGIN}, https://evil.example`],
			['a trailing slash', `${ORIGIN}/`],
		])('refuses %s', async (_label, origin) => {
			const { response, reached } = await run(post({ origin }));

			expect(reached).toBe(false);
			expect(response.status).toBe(403);
		});
	});

	describe('a request with neither header', () => {
		it('is refused on an unsafe method, because only a browser that strips both could be tricked into one', async () => {
			for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'QUERY']) {
				const { response, reached } = await run(post({}, method));

				expect(reached).toBe(false);
				expect(response.status).toBe(403);
			}
		});

		it('passes when the route allows clients that are not browsers', async () => {
			const { reached } = await run(post({}), { allowNonBrowser: true });

			expect(reached).toBe(true);
		});

		it('still refuses a browser request from another site on such a route', async () => {
			const options = { allowNonBrowser: true };

			expect((await run(post({ 'sec-fetch-site': 'cross-site' }), options)).reached).toBe(false);
			expect((await run(post({ origin: 'https://evil.example' }), options)).reached).toBe(false);
			expect((await run(post({ origin: ORIGIN }), options)).reached).toBe(true);
		});
	});

	describe('safe methods', () => {
		it.each(['GET', 'HEAD', 'OPTIONS'])('lets a cross-site %s through', async (method) => {
			const { reached } = await run(
				post({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, method),
			);

			expect(reached).toBe(true);
		});
	});

	it('refuses with 403 before the body is read', async () => {
		const pull = vi.fn();
		const body = new ReadableStream(
			{
				pull(controller) {
					pull();
					controller.enqueue(new TextEncoder().encode('{"a":1}'));
					controller.close();
				},
			},
			{ highWaterMark: 0 },
		);
		const request = new Request(`${ORIGIN}/api/cart`, {
			method: 'POST',
			headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
			body,
			duplex: 'half',
		} as RequestInit);

		const { response } = await run(request);

		expect(response.status).toBe(403);
		expect(request.bodyUsed).toBe(false);
		expect(pull).not.toHaveBeenCalled();
	});

	it('keeps a route with schema.body from reading or validating the body of a refused request', async () => {
		const handler = vi.fn(() => new Response('ok'));
		const validate = vi.fn((value: unknown) => ({ value }));
		const routes = compileApiRoutes([
			{
				path: '/api/cart',
				method: 'POST',
				middleware: [sameOrigin()],
				schema: { body: { '~standard': { version: 1, vendor: 'test', validate } } },
				handler,
			},
		]);
		const pipeline = new ApiRequestPipeline({
			getRenderContext: () => ({ render: vi.fn() }) as unknown as RenderContext,
			getCacheService: () => null,
		});
		const send = (headers: Record<string, string>) =>
			pipeline.tryHandle(
				new Request(`${ORIGIN}/api/cart`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...headers },
					body: '{"a":1}',
				}),
				routes,
				undefined,
			);

		expect((await send({ 'sec-fetch-site': 'cross-site' }))?.status).toBe(403);
		expect(validate).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();

		expect((await send({ 'sec-fetch-site': 'same-origin' }))?.status).toBe(200);
		expect(validate).toHaveBeenCalledOnce();
	});

	it('answers with onReject when the route gives one', async () => {
		const { response } = await run(post({ 'sec-fetch-site': 'cross-site' }), {
			onReject: () => new Response('no thanks', { status: 418 }),
		});

		expect(response.status).toBe(418);
		expect(await response.text()).toBe('no thanks');
	});

	it('answers a refusal with a JSON 403 by default', async () => {
		const { response } = await run(post({ 'sec-fetch-site': 'cross-site' }));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'Cross-origin request refused' });
	});
});
