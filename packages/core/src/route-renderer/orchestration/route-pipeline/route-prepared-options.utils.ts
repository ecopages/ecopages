import { LocalsAccessError } from '../../../errors/locals-access-error.ts';

/**
 * Proxy that throws when dynamic route locals are accessed on non-dynamic pages.
 */
export function createPageLocalsProxy(filePath: string): Record<string, never> {
	const errorMessage = `[ecopages] Request locals are only available during request-time rendering with cache: 'dynamic'. Page: ${filePath}. If you meant to use locals here, set cache: 'dynamic' and provide locals from route middleware/handlers.`;

	return new Proxy(
		{},
		{
			get: () => {
				throw new LocalsAccessError(errorMessage);
			},
			set: () => {
				throw new LocalsAccessError(errorMessage);
			},
			has: () => {
				throw new LocalsAccessError(errorMessage);
			},
			ownKeys: () => {
				throw new LocalsAccessError(errorMessage);
			},
			deleteProperty: () => {
				throw new LocalsAccessError(errorMessage);
			},
			defineProperty: () => {
				throw new LocalsAccessError(errorMessage);
			},
			getOwnPropertyDescriptor: () => {
				throw new LocalsAccessError(errorMessage);
			},
		},
	);
}
