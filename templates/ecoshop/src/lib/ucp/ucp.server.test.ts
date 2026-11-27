import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoProvider } from '@/lib/commerce/demo/demo-provider';
import { runStoreTool } from '@/lib/agents/store-tools.server';
import { handleUcpMcp, handleUcpProfile, readUcpProfile, ucpStoreDomain } from './ucp.server';

const ORIGIN = 'https://shop.test';
const SHOPIFY_ENV = { SHOPIFY_STORE_DOMAIN: 'my-store.myshopify.com', SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'token' };

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

function storeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('UCP on the demo catalog', () => {
	it('has no store domain, no profile and no endpoint', async () => {
		expect(ucpStoreDomain({})).toBeUndefined();
		expect(await readUcpProfile(ORIGIN, { env: {} })).toBeNull();

		const profile = await handleUcpProfile({ env: {} });
		const proxied = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			env: {},
		});

		expect(profile.status).toBe(404);
		expect(proxied.status).toBe(404);
	});
});

describe('the UCP profile of a connected store', () => {
	it('is the store profile with its MCP endpoint pointed at this site', async () => {
		const send = storeFetch(() => Response.json(storeProfile));

		const profile = await readUcpProfile(ORIGIN, { env: SHOPIFY_ENV, fetch: send });

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

	it('is served as JSON at /.well-known/ucp, and a store that has none is a bad gateway', async () => {
		const served = await handleUcpProfile({
			env: SHOPIFY_ENV,
			fetch: storeFetch(() => Response.json(storeProfile)),
			origin: ORIGIN,
		});
		const missing = await handleUcpProfile({
			env: SHOPIFY_ENV,
			fetch: storeFetch(() => new Response('', { status: 404 })),
			origin: ORIGIN,
		});

		expect(served.status).toBe(200);
		expect(((await served.json()) as typeof storeProfile).ucp.version).toBe('2026-08-25');
		expect(missing.status).toBe(502);
	});

	it('is what get_ucp_profile returns to an agent in the browser', async () => {
		vi.stubEnv('SHOPIFY_STORE_DOMAIN', SHOPIFY_ENV.SHOPIFY_STORE_DOMAIN);
		vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', SHOPIFY_ENV.SHOPIFY_STOREFRONT_ACCESS_TOKEN);
		vi.stubGlobal(
			'fetch',
			storeFetch(() => Response.json(storeProfile)),
		);
		const read = await readUcpProfile(ORIGIN);

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

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toEqual(read);
		expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(read);
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
			{ env: SHOPIFY_ENV, fetch: send },
		);

		expect(send).toHaveBeenCalledWith(
			'https://my-store.myshopify.com/api/ucp/mcp',
			expect.objectContaining({ method: 'POST', body: JSON.stringify(search) }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(answer);
	});

	it("passes the store's refusal through, such as a request without an agent profile", async () => {
		const send = storeFetch(() => Response.json({ error: 'meta.ucp-agent.profile is required' }, { status: 400 }));

		const response = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			env: SHOPIFY_ENV,
			fetch: send,
		});

		expect(response.status).toBe(400);
	});

	it('refuses another site, a body that is too large, and reports a store that does not answer', async () => {
		const send = storeFetch(() => Response.json({}));
		const foreign = await handleUcpMcp(
			new Request(`${ORIGIN}/api/ucp/mcp`, {
				method: 'POST',
				body: '{}',
				headers: { Origin: 'https://evil.test' },
			}),
			{ env: SHOPIFY_ENV, fetch: send },
		);
		const large = await handleUcpMcp(
			new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: 'x'.repeat(256 * 1024 + 1) }),
			{ env: SHOPIFY_ENV, fetch: send },
		);
		const down = await handleUcpMcp(new Request(`${ORIGIN}/api/ucp/mcp`, { method: 'POST', body: '{}' }), {
			env: SHOPIFY_ENV,
			fetch: vi.fn(async () => {
				throw new Error('offline');
			}),
		});

		expect(foreign.status).toBe(403);
		expect(large.status).toBe(413);
		expect(send).not.toHaveBeenCalled();
		expect(down.status).toBe(502);
	});
});
