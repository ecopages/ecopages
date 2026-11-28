import { getCommerceBackend } from '../commerce/index.server.ts';
import type { CartHttpDeps } from './cart-http.server.ts';

/**
 * The cart Endpoints' dependencies.
 */
export function cartHttpDeps(): CartHttpDeps {
	return { cart: getCommerceBackend().cart };
}
