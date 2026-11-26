/**
 * Whether a request comes from this site or from a client that is not a browser.
 *
 * @remarks
 * Browsers send `Origin` on every cross-site `POST`, form posts included; agents, MCP clients and `curl` send none.
 * Refusing a foreign `Origin` stops another site from changing a shopper's cart and blocks DNS rebinding against a
 * local server, without tokens. `trustedOrigin` is the configured site origin, for a proxy that rewrites the host.
 */
export function isSameOriginRequest(request: Request, trustedOrigin: string): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return true;
	if (origin === new URL(request.url).origin) return true;
	return origin === new URL(trustedOrigin).origin;
}
