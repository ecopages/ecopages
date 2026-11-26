import { createDemoProvider } from './demo/demo-provider';
import { createShopifyProvider } from './shopify/shopify-provider.server';
import type { CommerceProvider } from './types';

/**
 * The Storefront API version used when `SHOPIFY_API_VERSION` is unset. Shopify supports each stable version for
 * at least twelve months; move this forward when you upgrade.
 */
export const DEFAULT_SHOPIFY_API_VERSION = '2026-10';

export type CommerceEnv = Partial<
	Record<'SHOPIFY_STORE_DOMAIN' | 'SHOPIFY_STOREFRONT_ACCESS_TOKEN' | 'SHOPIFY_API_VERSION', string>
>;

export type CommerceConfig =
	{ kind: 'demo' } | { kind: 'shopify'; storeDomain: string; accessToken: string; apiVersion: string };

/**
 * Picks the provider from the environment: Shopify when both credentials are set, the demo catalog when neither is.
 *
 * @remarks
 * Exactly one credential is a configuration mistake, so it throws rather than quietly serving the demo catalog in
 * place of a real store.
 */
export function resolveCommerceConfig(env: CommerceEnv): CommerceConfig {
	const storeDomain = env.SHOPIFY_STORE_DOMAIN?.trim();
	const accessToken = env.SHOPIFY_STOREFRONT_ACCESS_TOKEN?.trim();
	if (!storeDomain && !accessToken) return { kind: 'demo' };
	if (!storeDomain || !accessToken) {
		const missing = storeDomain ? 'SHOPIFY_STOREFRONT_ACCESS_TOKEN' : 'SHOPIFY_STORE_DOMAIN';
		throw new Error(`${missing} is not set. Set both Shopify variables, or neither to use the demo catalog.`);
	}
	return {
		kind: 'shopify',
		storeDomain,
		accessToken,
		apiVersion: env.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION,
	};
}

export function createCommerceProvider(env: CommerceEnv): CommerceProvider {
	const config = resolveCommerceConfig(env);
	return config.kind === 'shopify' ? createShopifyProvider(config) : createDemoProvider();
}

let provider: CommerceProvider | undefined;

/**
 * The app's commerce provider, created from `process.env` on first use.
 */
export function getCommerce(): CommerceProvider {
	provider ??= createCommerceProvider(process.env);
	return provider;
}
