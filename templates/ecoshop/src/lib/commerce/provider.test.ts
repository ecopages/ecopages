import { describe, expect, it } from 'vitest';
import { createCommerceProvider, DEFAULT_SHOPIFY_API_VERSION, resolveCommerceConfig } from './provider.server';

describe('commerce provider selection', () => {
	it('uses the demo catalog when no Shopify credentials are set', () => {
		expect(resolveCommerceConfig({})).toEqual({ kind: 'demo' });
		expect(createCommerceProvider({}).kind).toBe('demo');
	});

	it('uses Shopify when the store domain and token are set', () => {
		const env = { SHOPIFY_STORE_DOMAIN: 'north-pier.myshopify.com', SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'token' };
		const config = resolveCommerceConfig(env);

		expect(createCommerceProvider(env).kind).toBe('shopify');

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
});
