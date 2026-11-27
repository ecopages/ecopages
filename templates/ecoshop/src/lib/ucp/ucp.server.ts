import { CommerceBackendError } from '@/lib/commerce/errors';
import { type CommerceEnv, resolveCommerceConfig } from '@/lib/commerce/provider.server';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { siteOrigin } from '@/lib/site-origin';
import { storePaths } from '@/lib/store-urls';

/**
 * The Universal Commerce Protocol (UCP) of a connected Shopify store: its profile and its MCP endpoint.
 *
 * @remarks
 * Shopify serves UCP on the store's own domain: a profile at `/.well-known/ucp` that lists the capabilities (catalog,
 * cart, checkout) and the endpoint that serves them, `/api/ucp/mcp`. This store forwards both, so a UCP client that
 * reaches the storefront gets the store's real catalog and carts, and an agent in the browser reads the same profile
 * through `get_ucp_profile`. The demo catalog has no store behind it, so it has no UCP: `/mcp` serves it.
 *
 * @module
 */

const PROFILE_TIMEOUT_MS = 10_000;
const PROXY_TIMEOUT_MS = 20_000;
const MAX_REQUEST_BYTES = 256 * 1024;

export interface UcpOptions {
	/** The environment that names the store. Default: `process.env`. */
	env?: CommerceEnv;
	/** Replaces the global `fetch`, for tests. */
	fetch?: typeof fetch;
}

/**
 * The domain of the connected Shopify store, such as `my-store.myshopify.com`, or `undefined` on the demo catalog.
 */
export function ucpStoreDomain(env: CommerceEnv = process.env): string | undefined {
	const config = resolveCommerceConfig(env);
	return config.kind === 'shopify' ? config.storeDomain.replace(/^https?:\/\//u, '').replace(/\/+$/u, '') : undefined;
}

/**
 * The store's UCP profile with its MCP endpoint pointed at this storefront, or `null` on the demo catalog.
 *
 * @remarks
 * Shopify's profile names the store's own endpoint. A client that read it would call Shopify and skip this
 * storefront, so every URL in the profile whose path is `/api/ucp/mcp` is replaced with this site's. The rest of the
 * profile is the store's, unchanged. Throws a `CommerceBackendError` when the store does not answer with a profile.
 */
export async function readUcpProfile(
	origin: string,
	{ env = process.env, fetch: send = fetch }: UcpOptions = {},
): Promise<Record<string, unknown> | null> {
	const domain = ucpStoreDomain(env);
	if (!domain) return null;

	let response: Response;
	try {
		response = await send(`https://${domain}${storePaths.ucpProfile}`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
		});
	} catch (error) {
		throw new CommerceBackendError(`The UCP profile request to ${domain} failed`, { cause: error });
	}
	if (!response.ok) throw new CommerceBackendError(`The store's UCP profile answered ${response.status}`);

	const profile: unknown = await response.json().catch(() => null);
	if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
		throw new CommerceBackendError('The store answered with a UCP profile that is not a JSON object');
	}
	return pointEndpointsHere(profile, `${origin.replace(/\/+$/u, '')}${storePaths.ucpMcp}`) as Record<string, unknown>;
}

function pointEndpointsHere(value: unknown, endpoint: string): unknown {
	if (typeof value === 'string') return isUcpEndpoint(value) ? endpoint : value;
	if (Array.isArray(value)) return value.map((entry) => pointEndpointsHere(entry, endpoint));
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, pointEndpointsHere(entry, endpoint)]),
		);
	}
	return value;
}

function isUcpEndpoint(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === 'https:' || url.protocol === 'http:') && url.pathname === storePaths.ucpMcp;
	} catch {
		return false;
	}
}

function notConnected(): Response {
	return Response.json(
		{
			error: 'UCP is served for a connected Shopify store. This store runs on the demo catalog: use /mcp.',
		},
		{ status: 404 },
	);
}

/**
 * Serves `/.well-known/ucp`: the connected store's UCP profile.
 */
export async function handleUcpProfile(options: UcpOptions & { origin?: string } = {}): Promise<Response> {
	try {
		const profile = await readUcpProfile(options.origin ?? siteOrigin, options);
		if (!profile) return notConnected();
		return Response.json(profile, { headers: { 'Cache-Control': 'public, max-age=300' } });
	} catch (error) {
		if (error instanceof CommerceBackendError) return Response.json({ error: error.message }, { status: 502 });
		throw error;
	}
}

/**
 * Forwards one UCP request to the connected store's `/api/ucp/mcp` and returns its answer as it came.
 *
 * @remarks
 * The body is the client's JSON-RPC message, including the `meta.ucp-agent.profile` the store requires, so the
 * store negotiates capabilities with the client itself and nothing is added or removed here. The destination is
 * fixed to the connected store, a foreign `Origin` is refused as on the other endpoints, and a body over 256 kB is
 * refused.
 */
export async function handleUcpMcp(
	request: Request,
	{ env = process.env, fetch: send = fetch }: UcpOptions = {},
): Promise<Response> {
	const domain = ucpStoreDomain(env);
	if (!domain) return notConnected();
	if (!isSameOriginRequest(request, siteOrigin)) {
		return Response.json({ error: 'Origin not allowed' }, { status: 403 });
	}

	const body = await request.text();
	if (body.length > MAX_REQUEST_BYTES) return Response.json({ error: 'Request too large' }, { status: 413 });

	let upstream: Response;
	try {
		upstream = await send(`https://${domain}${storePaths.ucpMcp}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: request.headers.get('accept') ?? 'application/json',
			},
			body,
			signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
		});
	} catch {
		return Response.json({ error: 'The store did not answer the UCP request' }, { status: 502 });
	}

	return new Response(await upstream.text(), {
		status: upstream.status,
		headers: {
			'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
			'Cache-Control': 'no-store',
		},
	});
}
