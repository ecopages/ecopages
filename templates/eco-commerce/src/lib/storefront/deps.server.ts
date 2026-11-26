import { getCommerceBackend } from '../commerce/index.server.ts';
import { siteOrigin } from '../site-origin.ts';
import type { CartHttpDeps } from './cart-http.server.ts';

/**
 * The cart Endpoints' dependencies.
 *
 * @remarks
 * `Secure` follows the public site origin (`ECOPAGES_BASE_URL`), because behind a TLS proxy the server itself
 * sees plain HTTP.
 */
export function cartHttpDeps(): CartHttpDeps {
	return { cart: getCommerceBackend().cart, secureCookie: siteOrigin.startsWith('https:') };
}
