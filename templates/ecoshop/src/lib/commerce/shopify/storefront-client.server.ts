import { CommerceBackendError } from '../errors';
import { normalizeStoreDomain } from './store-domain';

export interface StorefrontClientOptions {
	/** The store's domain, such as `my-store.myshopify.com`. A protocol or trailing slash is ignored. */
	storeDomain: string;
	/** A public Storefront API access token. */
	accessToken: string;
	/** A Storefront API version, such as `2026-10`. */
	apiVersion: string;
	/** Replaces the global `fetch`, for tests. */
	fetch?: typeof fetch;
	/** Aborts a request that takes longer, so a slow API cannot stall a render or an MCP call. */
	timeoutMs?: number;
}

export type StorefrontClient = <T>(document: string, variables?: Record<string, unknown>) => Promise<T>;

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

/**
 * Creates a minimal Storefront API GraphQL client over `fetch`.
 *
 * @remarks
 * Any GraphQL `errors` entry fails the call, even with partial `data`, so a page never renders half a product.
 * Mutation `userErrors` are data, and the provider reads them.
 */
export function createStorefrontClient(options: StorefrontClientOptions): StorefrontClient {
	const domain = normalizeStoreDomain(options.storeDomain);
	const endpoint = `https://${domain}/api/${options.apiVersion}/graphql.json`;
	const send = options.fetch ?? fetch;

	return async <T>(document: string, variables: Record<string, unknown> = {}): Promise<T> => {
		let response: Response;
		try {
			response = await send(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					'X-Shopify-Storefront-Access-Token': options.accessToken,
				},
				body: JSON.stringify({ query: document, variables }),
				signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
			});
		} catch (error) {
			throw new CommerceBackendError(`Storefront API request to ${domain} failed`, { cause: error });
		}

		if (!response.ok) {
			throw new CommerceBackendError(`Storefront API answered ${response.status} ${response.statusText}`.trim());
		}

		let payload: GraphQLResponse<T>;
		try {
			payload = (await response.json()) as GraphQLResponse<T>;
		} catch (error) {
			throw new CommerceBackendError('Storefront API answered with a body that is not JSON', { cause: error });
		}
		if (payload.errors?.length) {
			throw new CommerceBackendError(
				`Storefront API error: ${payload.errors.map((error) => error.message).join('; ')}`,
			);
		}
		if (!payload.data) {
			throw new CommerceBackendError('Storefront API returned no data');
		}
		return payload.data;
	};
}
