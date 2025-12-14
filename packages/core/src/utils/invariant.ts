/**
 * This module contains a simple utility invariant function that throws an error if the condition is not met
 * @module
 */

const prefix = '[ecopages]';

export function invariant(condition: boolean, message?: string): asserts condition {
	if (condition) {
		return;
	}

	const value = message ? `${prefix} ${message}` : `${prefix} An error occurred`;
	throw new Error(value);
}
