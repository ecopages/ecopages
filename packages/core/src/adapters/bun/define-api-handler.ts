import type { BunRequest } from 'bun';
import type { ApiHandler } from '../../public-types';

/**
 * Helper function specifically for Bun to define an API handler with
 * automatically inferred path type for BunRequest.
 *
 * @template TPath The literal string type of the path, inferred from the 'path' property.
 * @param handler The API handler configuration object using BunRequest.
 * @returns The same handler object, strongly typed for Bun.
 */
export function defineApiHandler<TPath extends string>(
  // The handler object expects ApiHandler structure, but specifically uses BunRequest<TPath>
  handler: ApiHandler<TPath, BunRequest<TPath>>,
): ApiHandler<TPath, BunRequest<TPath>> {
  return handler;
}
