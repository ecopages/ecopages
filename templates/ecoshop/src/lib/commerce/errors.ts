/**
 * A cart change the provider refused because of its input: an unknown or sold-out variant, or a quantity the
 * backend rejects. Its message is safe to show to the shopper or an agent.
 */
export class CartInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CartInputError';
	}
}

/**
 * The commerce backend failed or answered in a way the storefront cannot use.
 */
export class CommerceBackendError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'CommerceBackendError';
	}
}
