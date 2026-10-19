/**
 * This module contains a simple utility invariant function that throws an error if the condition is not met
 * @module
 */

const prefix = '[ecopages]';

/**
 * Throws a prefixed error when the condition is false.
 *
 * @param options Forwarded to the thrown error so callers can keep the original failure as `cause`.
 */
export function invariant(condition: boolean, message?: string, options?: ErrorOptions): asserts condition {
	if (condition) {
		return;
	}

	const value = message ? `${prefix} ${message}` : `${prefix} An error occurred`;
	throw new Error(value, options);
}
