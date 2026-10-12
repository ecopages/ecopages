import type { ResolvedHmrEntrypoint } from '../types/public-types.ts';

/**
 * Read-only access to dev-transform entrypoints registered for HMR.
 */
export interface HmrRegisteredEntrypointsContext {
	getRegisteredEntrypoints(): ReadonlyMap<string, ResolvedHmrEntrypoint>;
}
