import type { ApiHandlerContext } from '../public-types.ts';

/**
 * Creates a require function for validating and retrieving request locals.
 * Supports both single key access and multiple keys with type safety.
 *
 * @param getLocals - Function that returns the current locals object
 * @returns A require function that throws the onMissing response if keys are not found
 *
 * @example
 * ```ts
 * const require = createRequire(() => context.locals);
 * const userId = require('userId', () => new Response('Unauthorized', { status: 401 }));
 * ```
 */
export function createRequire(getLocals: () => Record<string, unknown>): ApiHandlerContext['require'] {
	return ((keyOrKeys: string | readonly string[], onMissing: () => Response) => {
		const locals = getLocals();
		if (Array.isArray(keyOrKeys)) {
			const result: Record<string, unknown> = {};
			for (const key of keyOrKeys) {
				const value = locals[key];
				if (value === undefined || value === null) {
					throw onMissing();
				}
				result[key] = value;
			}
			return result;
		}

		const value = locals[keyOrKeys as string];
		if (value === undefined || value === null) {
			throw onMissing();
		}
		return value;
	}) as unknown as ApiHandlerContext['require'];
}
