import { CATALOG_VERSION, resolveCatalogSize } from '../catalog/generator.ts';
import { getCatalogDb } from '../db/catalog-database.server.ts';
import { siteOrigin } from '../site-origin.ts';
import type { CartActionDeps } from './cart-actions.server.ts';
import { resolveCartSecret } from './cart-cookie.server.ts';

/**
 * What the cart Endpoints and the order page need, read per request.
 *
 * @remarks
 * The signing key adds the catalog size and generator version to `CART_SECRET`. Product ids are assigned in order
 * per size, so after a regeneration an old cookie's ids would name other products; with the key changed, the old
 * cookie fails its signature and reads as an empty cart instead. `Secure` follows the public site origin
 * (`ECOPAGES_BASE_URL`), because the server sees plain HTTP behind a TLS proxy.
 */
export async function getCartDeps(): Promise<CartActionDeps> {
	const { name } = resolveCatalogSize(process.env.CATALOG_SIZE);
	return {
		db: await getCatalogDb(),
		secret: `${resolveCartSecret()}:${name}:${CATALOG_VERSION}`,
		secureCookie: siteOrigin.startsWith('https:'),
	};
}
