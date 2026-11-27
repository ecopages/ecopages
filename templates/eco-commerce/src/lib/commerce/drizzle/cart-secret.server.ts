import { isProductionRuntime } from '@ecopages/core';

const MIN_SECRET_LENGTH = 32;

/**
 * Signs development carts when `CART_SECRET` is unset.
 *
 * @remarks
 * Public by design, so it never signs a production cart: {@link resolveCartSecret} refuses it there.
 */
const DEVELOPMENT_SECRET = 'eco-commerce-development-cart-secret-not-for-production';

/**
 * Reads the secret that signs the cart cookie.
 *
 * @remarks
 * Called per cart operation rather than at module load, because the build renders catalog pages without one.
 */
export function resolveCartSecret(env: NodeJS.ProcessEnv = process.env): string {
	const secret = env.CART_SECRET;
	const production = isProductionRuntime(env);
	if (secret) {
		if (production && secret.length < MIN_SECRET_LENGTH) {
			throw new Error(`CART_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`);
		}
		return secret;
	}
	if (production) {
		throw new Error('Set CART_SECRET to sign cart cookies in production. See .env.example.');
	}
	return DEVELOPMENT_SECRET;
}
