import type { CommerceBackend } from '../backend.ts';
import { createDatabaseCart } from './cart.server.ts';
import { createDrizzleCatalog } from './catalog.server.ts';
import type { CatalogDb } from './database.server.ts';

export type DrizzleBackendOptions = {
	getDb: () => Promise<CatalogDb>;
	/** Returns the secret that signs the cart cookie; called per cart operation. */
	getCartSecret: () => string;
};

/**
 * The default adapter: the catalog and the carts in a libSQL database through Drizzle, the cart id in a signed
 * cookie.
 *
 * @remarks
 * Regenerating the catalog, for another `CATALOG_SIZE` or generator version, also clears the carts, whose lines
 * name variants of the old catalog.
 */
export function createDrizzleBackend({ getDb, getCartSecret }: DrizzleBackendOptions): CommerceBackend {
	return {
		catalog: createDrizzleCatalog(getDb),
		cart: createDatabaseCart(getDb, getCartSecret),
	};
}
