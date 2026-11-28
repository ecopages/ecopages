import { CommerceBackendError } from '@/lib/commerce/errors';
import type { CommerceProvider } from '@/lib/commerce/types';
import { readBounded } from '@/lib/http/read-bounded';
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

/**
 * The MCP headers that carry a session and the protocol version between the client and the store.
 */
const FORWARDED_HEADERS = ['mcp-session-id', 'mcp-protocol-version'] as const;

export interface UcpOptions {
	/** The provider that says whether a store is connected, and where. */
	provider: CommerceProvider;
}

const PROFILE_CACHE_MS = 5 * 60 * 1000;

/**
 * The profiles the connected stores answered, by store origin, as the store sent them.
 */
const profileCache = new Map<string, { at: number; profile: Record<string, unknown> }>();

/**
 * The store's UCP profile with its MCP endpoint pointed at this storefront, or `null` on the demo catalog.
 *
 * @remarks
 * Shopify's profile names the store's own endpoint. A client that read it would call Shopify and skip this
 * storefront, so every URL in the profile whose path is `/api/ucp/mcp` is replaced with this site's. The rest of the
 * profile is the store's, unchanged. The store's profile is kept for five minutes, as long as `/.well-known/ucp`
 * tells a client to keep it, so the page tool and the route do not ask Shopify on every call; a failure is not kept.
 * The endpoints are pointed at `origin` on each read, so the cache holds one entry per store however many hosts
 * serve this site. Throws a `CommerceBackendError` when the store does not answer with a profile.
 */
export async function readUcpProfile(
	origin: string,
	{ provider }: UcpOptions,
): Promise<Record<string, unknown> | null> {
	const storeOrigin = provider.ucpOrigin();
	if (!storeOrigin) return null;

	const endpoint = `${origin.replace(/\/+$/u, '')}${storePaths.ucpMcp}`;
	const cached = profileCache.get(storeOrigin);
	if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) {
		return pointEndpointsHere(cached.profile, endpoint) as Record<string, unknown>;
	}

	let response: Response;
	try {
		response = await fetch(`${storeOrigin}${storePaths.ucpProfile}`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
		});
	} catch (error) {
		throw new CommerceBackendError(`The UCP profile request to ${storeOrigin} failed`, { cause: error });
	}
	if (!response.ok) throw new CommerceBackendError(`The store's UCP profile answered ${response.status}`);

	const profile: unknown = await response.json().catch(() => null);
	if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
		throw new CommerceBackendError('The store answered with a UCP profile that is not a JSON object');
	}
	profileCache.set(storeOrigin, { at: Date.now(), profile: profile as Record<string, unknown> });
	return pointEndpointsHere(profile, endpoint) as Record<string, unknown>;
}

/**
 * A line that says what a profile offers, for the text of a tool result whose data is the profile itself.
 */
export function describeUcpProfile(profile: Record<string, unknown>): string {
	const ucp = profile.ucp;
	const capabilities =
		typeof ucp === 'object' &&
		ucp !== null &&
		'capabilities' in ucp &&
		typeof ucp.capabilities === 'object' &&
		ucp.capabilities
			? Object.keys(ucp.capabilities)
			: [];
	return capabilities.length
		? `The store's UCP profile lists ${capabilities.length} capabilities: ${capabilities.join(', ')}.`
		: "The store's UCP profile.";
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
 * Serves `/.well-known/ucp`: the connected store's UCP profile, with its endpoint on the origin of the request.
 *
 * @remarks
 * The answer depends on the host, so a shared cache keeps one copy per `Host` (and `X-Forwarded-Host`, which a
 * proxy that `trustProxy` trusts may set) instead of serving one host's endpoint to another.
 */
export async function handleUcpProfile(request: Request, options: UcpOptions): Promise<Response> {
	try {
		const profile = await readUcpProfile(new URL(request.url).origin, options);
		if (!profile) return notConnected();
		return Response.json(profile, {
			headers: { 'Cache-Control': 'public, max-age=300', Vary: 'Host, X-Forwarded-Host' },
		});
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
 * fixed to the connected store, and a body over 256 kB is refused. The route refuses a request another site started
 * before this runs and passes clients that are not browsers, which UCP clients are.
 */
export async function handleUcpMcp(request: Request, { provider }: UcpOptions): Promise<Response> {
	const storeOrigin = provider.ucpOrigin();
	if (!storeOrigin) return notConnected();

	const body = await readBounded(request, MAX_REQUEST_BYTES);
	if (!body) return Response.json({ error: 'Request too large' }, { status: 413 });

	const headers = new Headers({
		'Content-Type': 'application/json',
		Accept: request.headers.get('accept') ?? 'application/json',
	});
	for (const name of FORWARDED_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	try {
		const upstream = await fetch(`${storeOrigin}${storePaths.ucpMcp}`, {
			method: 'POST',
			headers,
			body,
			signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
		});
		const answer = new Headers({
			'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
			'Cache-Control': 'no-store',
		});
		for (const name of FORWARDED_HEADERS) {
			const value = upstream.headers.get(name);
			if (value) answer.set(name, value);
		}
		return new Response(await upstream.text(), { status: upstream.status, headers: answer });
	} catch {
		return Response.json({ error: 'The store did not answer the UCP request' }, { status: 502 });
	}
}
