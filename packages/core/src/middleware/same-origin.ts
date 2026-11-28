import type { EcoMiddleware } from '../types/middleware-types.ts';
import { createMiddleware } from './create-middleware.ts';

/**
 * Options of {@link sameOrigin}.
 */
export type SameOriginOptions = {
	/**
	 * Lets a request through when it carries neither `Sec-Fetch-Site` nor `Origin`.
	 *
	 * @remarks
	 * Every browser sends at least one of them on a state-changing request, so such a request comes from a client
	 * that is not a browser: an MCP client, a webhook, `curl`. It carries no ambient credentials a page could
	 * borrow, so it is no cross-site request forgery. Set this on a route that serves those clients and
	 * authenticates them itself; a route a browser form posts to leaves it off.
	 *
	 * @default false
	 */
	allowNonBrowser?: boolean;
	/**
	 * Builds the 403 answer, for a route whose clients expect another shape than the default JSON error.
	 */
	onReject?: (request: Request) => Response;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'QUERY']);

/**
 * Whether the browser says a user or the site itself sent the request: `same-origin`, or `none` for a request no
 * site started (a typed URL, a bookmark, a reload).
 */
function isFromThisSite(secFetchSite: string): boolean {
	return secFetchSite === 'same-origin' || secFetchSite === 'none';
}

/**
 * Refuses a state-changing request that another site started, with HTTP 403 and before the body is read.
 *
 * @remarks
 * Safe methods (`GET`, `HEAD`, `OPTIONS` and `QUERY`, which core's `defineQuery` treats as safe and idempotent)
 * always pass: they change nothing, and a page of another site cannot read their answer. For any other method:
 *
 * 1. `Sec-Fetch-Site`, when the browser sends it, decides: `same-origin` passes, and so does `none`, which only
 *    the user agent sets (a typed URL, a bookmark, a reload or form resubmission), so no site can cause it.
 *    `same-site` is refused, so a sibling subdomain cannot post, and so is `cross-site` or any other value.
 * 2. Without it, `Origin` must equal the origin of `request.url`. `null` and any other value are refused.
 * 3. With neither, the request is refused: a browser that strips both would otherwise be an open door. A route
 *    that serves clients that are not browsers opts in with `allowNonBrowser`.
 *
 * The comparison is sound only once the request's host is trusted. The Ecopages server refuses a host that
 * `allowedHosts` does not allow, so `request.url` is the address the visitor used; without that, a DNS rebinding
 * page would send an `Origin` equal to its own name. Behind a TLS-terminating proxy, set `trustProxy` for the
 * protocol, or the `Origin` fallback compares `https` with `http`.
 *
 * It runs as a middleware, ahead of the `schema.body` read, so a refused request's body is never buffered.
 *
 * @example
 * ```ts
 * definePost({
 *   path: '/api/cart',
 *   middleware: [sameOrigin()],
 *   handler: async ({ response }) => response.json({ ok: true }),
 * });
 * ```
 */
export function sameOrigin(options: SameOriginOptions = {}): EcoMiddleware<{}> {
	const refuse = (request: Request): Response =>
		options.onReject?.(request) ?? Response.json({ error: 'Cross-origin request refused' }, { status: 403 });

	return createMiddleware((context, next) => {
		const { request } = context;
		if (SAFE_METHODS.has(request.method.toUpperCase())) return next();

		const secFetchSite = request.headers.get('sec-fetch-site');
		if (secFetchSite !== null) return isFromThisSite(secFetchSite) ? next() : refuse(request);

		const origin = request.headers.get('origin');
		if (origin !== null) return origin === new URL(request.url).origin ? next() : refuse(request);

		return options.allowNonBrowser ? next() : refuse(request);
	});
}
