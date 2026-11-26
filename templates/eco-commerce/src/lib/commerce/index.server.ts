import type { CommerceBackend } from './backend.ts';
import { createDrizzleBackend } from './drizzle/adapter.server.ts';
import { resolveCartSecret } from './drizzle/cart-secret.server.ts';
import { getCatalogDb } from './drizzle/database.server.ts';

export type { CommerceBackend } from './backend.ts';

let backend: CommerceBackend | undefined;

/**
 * The commerce backend the storefront uses: the Drizzle adapter over `DATABASE_URL`.
 *
 * @remarks
 * To plug in another backend, construct its adapter here instead; nothing else in the app changes. The adapter
 * opens its database lazily, on the first read, so importing this module costs nothing at build time.
 */
export function getCommerceBackend(): CommerceBackend {
	backend ??= createDrizzleBackend({ getDb: () => getCatalogDb(), getCartSecret: () => resolveCartSecret() });
	return backend;
}
