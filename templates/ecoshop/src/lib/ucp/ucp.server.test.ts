import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import type { CommerceProvider } from '@/lib/commerce/types';

const ORIGIN = 'https://shop.test';
const demo = createDemoProvider();
const shopify: CommerceProvider = { ...demo, ucpOrigin: () => 'https://my-store.myshopify.com' };

const storeProfile = {
	ucp: {
		version: '2026-08-25',
		services: {
			'dev.ucp.shopping': [
				{ transport: 'mcp', endpoint: 'https://www.my-store.com/api/ucp/mcp' },
				{ transport: 'embedded', endpoint: 'https://www.my-store.com/api/ucp/embedded' },
			],
		},
		capabilities: {
			'dev.ucp.shopping.catalog.search': [{ version: '2026-08-25' }],
			'dev.ucp.shopping.cart': [{ version: '2026-08-25' }],
		},
	},
};

/** Answers every `fetch` of the module under test, the store's included. */
function storeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
	const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
	vi.stubGlobal('fetch', send);
	return send;
}

let ucp: typeof import('./ucp.server');
let tools: typeof import('@/lib/agents/store-tools.server');

/** Each test gets the module afresh, so the profile cache of one never reaches another. */
beforeEach(async () => {
	vi.resetModules();
	ucp = await import('./ucp.server');
	tools = await import('@/lib/agents/store-tools.server');
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const readUcpProfile: typeof ucp.readUcpProfile = (...args) => ucp.readUcpProfile(...args);
const handleUcpProfile: typeof ucp.handleUcpProfile = (...args) => ucp.handleUcpProfile(...args);
const handleUcpMcp: typeof ucp.handleUcpMcp = (...args) => ucp.handleUcpMcp(...args);
const runStoreTool: typeof tools.runStoreTool = (...args) => tools.runStoreTool(...args);
const profileRequest = (origin = ORIGIN) => new Request(`${origin}/.well-known/ucp`);

describe('UCP on the demo catalog', () => {
	it('has no store domain, no profile and no endpoint', async () => {
		expect(await readUcpProfile(ORIGIN, { provider: demo })).toBeNull();

		const profile = await handleUcpProfile(profileRequest(), { provider: demo });
		const proxied = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			provider: demo,
		});

		expect(profile.status).toBe(404);
		expect(proxied.status).toBe(404);
	});
});

describe('the UCP profile of a connected store', () => {
	it('is the store profile with its MCP endpoint pointed at this site', async () => {
		const send = storeFetch(() => Response.json(storeProfile));

		const profile = await readUcpProfile(ORIGIN, { provider: shopify });

		expect(send).toHaveBeenCalledWith(
			'https://my-store.myshopify.com/.well-known/ucp',
			expect.objectContaining({ headers: { Accept: 'application/json' } }),
		);
		expect(profile).toEqual({
			ucp: {
				...storeProfile.ucp,
				services: {
					'dev.ucp.shopping': [
						{ transport: 'mcp', endpoint: 'https://shop.test/api/ucp/mcp' },
						{ transport: 'embedded', endpoint: 'https://www.my-store.com/api/ucp/embedded' },
					],
				},
			},
		});
		expect(Object.keys((profile as typeof storeProfile).ucp.capabilities)).toEqual([
			'dev.ucp.shopping.catalog.search',
			'dev.ucp.shopping.cart',
		]);
	});

	it('is asked of the store once in five minutes, and again after that', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(1_000);
		const send = storeFetch(() => Response.json(storeProfile));
		const options = { provider: shopify };

		await readUcpProfile(ORIGIN, options);
		vi.setSystemTime(1_000 + 4 * 60 * 1000);
		await readUcpProfile(ORIGIN, options);
		expect(send).toHaveBeenCalledTimes(1);

		vi.setSystemTime(1_000 + 6 * 60 * 1000);
		await readUcpProfile(ORIGIN, options);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('is not kept when the store did not answer, and is pointed at each host that asks', async () => {
		let answer = () => new Response('', { status: 503 });
		const send = storeFetch(() => answer());

		await expect(readUcpProfile(ORIGIN, { provider: shopify })).rejects.toThrow(/503/u);
		answer = () => Response.json(storeProfile);
		const here = await readUcpProfile(ORIGIN, { provider: shopify });
		const elsewhere = await readUcpProfile('https://preview.test', { provider: shopify });

		expect(send).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(here)).toContain('https://shop.test/api/ucp/mcp');
		expect(JSON.stringify(elsewhere)).toContain('https://preview.test/api/ucp/mcp');
		expect(JSON.stringify(elsewhere)).not.toContain('https://shop.test/api/ucp/mcp');
	});

	it('is served as JSON at /.well-known/ucp, and a store that has none is a bad gateway', async () => {
		storeFetch(() => Response.json(storeProfile));
		const served = await handleUcpProfile(profileRequest(), { provider: shopify });
		vi.resetModules();
		ucp = await import('./ucp.server');
		storeFetch(() => new Response('', { status: 404 }));
		const missing = await handleUcpProfile(profileRequest(), { provider: shopify });

		expect(served.status).toBe(200);
		expect(((await served.json()) as typeof storeProfile).ucp.version).toBe('2026-08-25');
		expect(missing.status).toBe(502);
	});

	it('points the served profile at the host of the request', async () => {
		storeFetch(() => Response.json(storeProfile));

		const served = await handleUcpProfile(profileRequest('https://preview.test'), { provider: shopify });

		expect(JSON.stringify(await served.json())).toContain('https://preview.test/api/ucp/mcp');
		expect(served.headers.get('vary')).toBe('Host, X-Forwarded-Host');
	});

	it('is what get_ucp_profile returns to an agent in the browser', async () => {
		storeFetch(() => Response.json(storeProfile));
		const read = (await (await handleUcpProfile(profileRequest(), { provider: shopify })).json()) as Record<
			string,
			unknown
		>;

		const { result } = await runStoreTool(
			'get_ucp_profile',
			{},
			{ provider: shopify, origin: ORIGIN, surface: 'page', cartId: undefined },
		);

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual(read);
		expect(result.structuredContent).toMatchObject({
			ucp: {
				services: { 'dev.ucp.shopping': [{ endpoint: 'https://shop.test/api/ucp/mcp' }, expect.anything()] },
			},
		});
		expect(result.content[0]?.text).toBe(
			"The store's UCP profile lists 2 capabilities: dev.ucp.shopping.catalog.search, dev.ucp.shopping.cart.",
		);
	});

	it('is an error result for get_ucp_profile when the store does not answer', async () => {
		storeFetch(() => new Response('', { status: 503 }));

		const { result } = await runStoreTool(
			'get_ucp_profile',
			{},
			{ provider: shopify, origin: ORIGIN, surface: 'page', cartId: undefined },
		);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/503/u);
	});

	it('is an error result for get_ucp_profile on the demo catalog', async () => {
		const { result } = await runStoreTool(
			'get_ucp_profile',
			{},
			{
				provider: createDemoProvider(),
				origin: ORIGIN,
				surface: 'page',
				cartId: undefined,
			},
		);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/demo catalog/u);
	});
});

describe('the UCP endpoint of a connected store', () => {
	const search = {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: {
			name: 'search_catalog',
			arguments: {
				meta: { 'ucp-agent': { profile: 'https://agent.test/profile.json' } },
				catalog: { query: 'shirt' },
			},
		},
	};

	it("forwards the client's request to the store and returns the store's answer", async () => {
		const answer = {
			jsonrpc: '2.0',
			id: 1,
			result: { structuredContent: { products: [{ title: 'Field Shirt' }] } },
		};
		const send = storeFetch(() => Response.json(answer, { status: 200 }));

		const response = await handleUcpMcp(
			new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: JSON.stringify(search) }),
			{ provider: shopify },
		);

		const [url, init] = vi.mocked(send).mock.calls[0] ?? [];
		expect(url).toBe('https://my-store.myshopify.com/api/ucp/mcp');
		expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(JSON.stringify(search));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(answer);
	});

	it("passes the store's refusal through, such as a request without an agent profile", async () => {
		const send = storeFetch(() => Response.json({ error: 'meta.ucp-agent.profile is required' }, { status: 400 }));

		const response = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			provider: shopify,
		});

		expect(response.status).toBe(400);
	});

	it('forwards the accept and MCP headers and brings back the type and the session of the answer', async () => {
		const send = storeFetch(
			() =>
				new Response('event: message\ndata: {}\n\n', {
					headers: { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'session-2' },
				}),
		);

		const response = await handleUcpMcp(
			new Request(`${ORIGIN}/api/ucp/mcp`, {
				method: 'POST',
				body: '{}',
				headers: {
					Accept: 'text/event-stream',
					'Mcp-Session-Id': 'session-1',
					'MCP-Protocol-Version': '2025-06-18',
				},
			}),
			{ provider: shopify },
		);

		const sent = new Headers(vi.mocked(send).mock.calls[0]?.[1]?.headers);
		expect(sent.get('accept')).toBe('text/event-stream');
		expect(sent.get('mcp-session-id')).toBe('session-1');
		expect(sent.get('mcp-protocol-version')).toBe('2025-06-18');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(response.headers.get('mcp-session-id')).toBe('session-2');
	});

	it('refuses a body over 256 kB counted in bytes, not characters', async () => {
		const send = storeFetch(() => Response.json({}));
		const multibyte = '\u00e9'.repeat(200 * 1024);

		const response = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: multibyte }), {
			provider: shopify,
		});

		expect(multibyte.length).toBeLessThan(256 * 1024);
		expect(response.status).toBe(413);
		expect(send).not.toHaveBeenCalled();
	});

	it('stops reading a body that streams past the limit without a content-length', async () => {
		const send = storeFetch(() => Response.json({}));
		let cancelled = false;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array(100 * 1024));
			},
			cancel() {
				cancelled = true;
			},
		});

		const response = await handleUcpMcp(
			new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: endless, duplex: 'half' } as RequestInit),
			{ provider: shopify },
		);

		expect(response.status).toBe(413);
		expect(cancelled).toBe(true);
		expect(send).not.toHaveBeenCalled();
	});

	it('answers 502 when the store breaks off its answer', async () => {
		const broken = new Response(
			new ReadableStream({
				start(controller) {
					controller.error(new Error('reset'));
				},
			}),
		);

		storeFetch(() => broken);

		const response = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			provider: shopify,
		});

		expect(response.status).toBe(502);
	});

	it('refuses a body that is too large, and reports a store that does not answer', async () => {
		const send = storeFetch(() => Response.json({}));
		const large = await handleUcpMcp(
			new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: 'x'.repeat(256 * 1024 + 1) }),
			{ provider: shopify },
		);
		expect(large.status).toBe(413);
		expect(send).not.toHaveBeenCalled();

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			}),
		);
		const down = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			provider: shopify,
		});

		expect(down.status).toBe(502);
	});
});
