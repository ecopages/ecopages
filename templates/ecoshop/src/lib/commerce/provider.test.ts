import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createCommerceProvider,
	DEFAULT_SHOPIFY_API_VERSION,
	resolveCommerceConfig,
	usesDemoCatalog,
} from './provider.server';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('commerce provider selection', () => {
	it('uses the demo catalog when no Shopify credentials are set', () => {
		expect(resolveCommerceConfig({})).toEqual({ kind: 'demo' });
		expect(usesDemoCatalog({})).toBe(true);
	});

	it('uses Shopify when the store domain and token are set', () => {
		const env = { SHOPIFY_STORE_DOMAIN: 'north-pier.myshopify.com', SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'token' };
		const config = resolveCommerceConfig(env);

		expect(usesDemoCatalog(env)).toBe(false);

		expect(config).toEqual({
			kind: 'shopify',
			storeDomain: 'north-pier.myshopify.com',
			accessToken: 'token',
			apiVersion: DEFAULT_SHOPIFY_API_VERSION,
		});
	});

	it('lets SHOPIFY_API_VERSION override the pinned version', () => {
		const config = resolveCommerceConfig({
			SHOPIFY_STORE_DOMAIN: 'north-pier.myshopify.com',
			SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'token',
			SHOPIFY_API_VERSION: '2026-07',
		});

		expect(config).toMatchObject({ apiVersion: '2026-07' });
	});

	it('refuses half a configuration instead of falling back to the demo', () => {
		expect(() => resolveCommerceConfig({ SHOPIFY_STORE_DOMAIN: 'north-pier.myshopify.com' })).toThrow(
			/SHOPIFY_STOREFRONT_ACCESS_TOKEN/u,
		);
	});

	it('reads the demo catalog without Shopify credentials and the Storefront API with them', async () => {
		const fetch = vi.fn(async () => Response.json({ data: { shop: { name: 'North Pier', description: null } } }));
		vi.stubGlobal('fetch', fetch);

		expect((await createCommerceProvider({}).getStore()).name).toBe('Ecoshop');
		expect(fetch).not.toHaveBeenCalled();

		const store = await createCommerceProvider({
			SHOPIFY_STORE_DOMAIN: 'north-pier.myshopify.com',
			SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'token',
		}).getStore();
		expect(store.name).toBe('North Pier');
		expect(fetch).toHaveBeenCalledWith(
			`https://north-pier.myshopify.com/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`,
			expect.anything(),
		);
	});
});
